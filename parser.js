"use strict";

var postcss = require('postcss');

var gonzales = require('gonzales-pe');

var DEFAULT_RAWS_ROOT = {
  before: ''
};
var DEFAULT_RAWS_RULE = {
  before: '',
  between: ''
};
var DEFAULT_RAWS_DECL = {
  before: '',
  between: '',
  semicolon: false
};
var DEFAULT_COMMENT_DECL = {
  before: ''
};
var SUPPORTED_AT_KEYWORDS = ['media'];

var SassParser = /*#__PURE__*/function () {
  function SassParser(input) {
    this.input = input;
  }

  var _proto = SassParser.prototype;

  _proto.parse = function parse() {
    try {
      this.node = gonzales.parse(this.input.css, {
        syntax: 'sass'
      });
    } catch (error) {
      throw this.input.error(error.message, error.line, 1);
    }

    this.lines = this.input.css.match(/^.*(\r?\n|$)/gm);
    this.root = this.stylesheet(this.node);
  };

  _proto.extractSource = function extractSource(start, end) {
    var nodeLines = this.lines.slice(start.line - 1, end.line);
    nodeLines[0] = nodeLines[0].substring(start.column - 1);
    var last = nodeLines.length - 1;
    nodeLines[last] = nodeLines[last].substring(0, end.column);
    return nodeLines.join('');
  };

  _proto.stylesheet = function stylesheet(node) {
    var _this = this;

    // Create and set parameters for Root node
    var root = postcss.root();
    root.source = {
      start: node.start,
      end: node.end,
      input: this.input
    }; // Raws for root node

    root.raws = {
      semicolon: DEFAULT_RAWS_ROOT.semicolon,
      before: DEFAULT_RAWS_ROOT.before
    }; // Store spaces before root (if exist)

    this.raws = {
      before: ''
    };
    node.content.forEach(function (contentNode) {
      return _this.process(contentNode, root);
    });
    return root;
  };

  _proto.process = function process(node, parent) {
    if (this[node.type]) return this[node.type](node, parent) || null;
    return null;
  };

  _proto.ruleset = function ruleset(node, parent) {
    var _this2 = this;

    // Loop to find the deepest ruleset node
    this.raws.multiRuleProp = '';
    node.content.forEach(function (contentNode) {
      switch (contentNode.type) {
        case 'block':
          {
            // Create Rule node
            var rule = postcss.rule();
            rule.selector = ''; // Object to store raws for Rule

            var ruleRaws = {
              before: _this2.raws.before || DEFAULT_RAWS_RULE.before,
              between: DEFAULT_RAWS_RULE.between
            }; // Variable to store spaces and symbols before declaration property

            _this2.raws.before = '';
            _this2.raws.comment = false; // Look up throw all nodes in current ruleset node

            node.content.filter(function (content) {
              return content.type === 'block';
            }).forEach(function (innerContentNode) {
              return _this2.process(innerContentNode, rule);
            });

            if (rule.nodes.length) {
              // Write selector to Rule
              rule.selector = _this2.extractSource(node.start, contentNode.start).slice(0, -1).replace(/\s+$/, function (spaces) {
                ruleRaws.between = spaces;
                return '';
              }); // Set parameters for Rule node

              rule.parent = parent;
              rule.source = {
                start: node.start,
                end: node.end,
                input: _this2.input
              };
              rule.raws = ruleRaws;
              parent.nodes.push(rule);
            }

            break;
          }

        default:
      }
    });
  };

  _proto.block = function block(node, parent) {
    var _this3 = this;

    // If nested rules exist, wrap current rule in new rule node
    if (this.raws.multiRule) {
      if (this.raws.multiRulePropVariable) {
        this.raws.multiRuleProp = "$" + this.raws.multiRuleProp;
      }

      var multiRule = Object.assign(postcss.rule(), {
        source: {
          start: {
            line: node.start.line - 1,
            column: node.start.column
          },
          end: node.end,
          input: this.input
        },
        raws: {
          before: this.raws.before || DEFAULT_RAWS_RULE.before,
          between: DEFAULT_RAWS_RULE.between
        },
        parent: parent,
        selector: (this.raws.customProperty ? '--' : '') + this.raws.multiRuleProp
      });
      parent.push(multiRule);
      parent = multiRule;
    }

    this.raws.before = ''; // Looking for declaration node in block node

    node.content.forEach(function (contentNode) {
      return _this3.process(contentNode, parent);
    });

    if (this.raws.multiRule) {
      this.raws.beforeMulti = this.raws.before;
    }
  };

  _proto.declaration = function declaration(node, parent) {
    var _this4 = this;

    var isBlockInside = false; // Create Declaration node

    var declarationNode = postcss.decl();
    declarationNode.prop = ''; // Object to store raws for Declaration

    var declarationRaws = Object.assign(declarationNode.raws, {
      before: this.raws.before || DEFAULT_RAWS_DECL.before,
      between: DEFAULT_RAWS_DECL.between,
      semicolon: DEFAULT_RAWS_DECL.semicolon
    });
    this.raws.property = false;
    this.raws.betweenBefore = false;
    this.raws.comment = false; // Looking for property and value node in declaration node

    node.content.forEach(function (contentNode) {
      switch (contentNode.type) {
        case 'customProperty':
          _this4.raws.customProperty = true;
        // fall through

        case 'property':
          {
            /* this.raws.property to detect is property is already defined in current object */
            _this4.raws.property = true;
            _this4.raws.multiRuleProp = contentNode.content[0].content;
            _this4.raws.multiRulePropVariable = contentNode.content[0].type === 'variable';

            _this4.process(contentNode, declarationNode);

            break;
          }

        case 'propertyDelimiter':
          {
            if (_this4.raws.property && !_this4.raws.betweenBefore) {
              /* If property is already defined and there's no ':' before it */
              declarationRaws.between += contentNode.content;
              _this4.raws.multiRuleProp += contentNode.content;
            } else {
              /* If ':' goes before property declaration, like :width 100px */
              _this4.raws.betweenBefore = true;
              declarationRaws.before += contentNode.content;
              _this4.raws.multiRuleProp += contentNode.content;
            }

            break;
          }

        case 'space':
          {
            declarationRaws.between += contentNode.content;
            break;
          }

        case 'value':
          {
            // Look up for a value for current property
            switch (contentNode.content[0].type) {
              case 'block':
                {
                  isBlockInside = true; // If nested rules exist

                  if (Array.isArray(contentNode.content[0].content)) {
                    _this4.raws.multiRule = true;
                  }

                  _this4.process(contentNode.content[0], parent);

                  break;
                }

              case 'variable':
                {
                  declarationNode.value = '$';

                  _this4.process(contentNode, declarationNode);

                  break;
                }

              case 'color':
                {
                  declarationNode.value = '#';

                  _this4.process(contentNode, declarationNode);

                  break;
                }

              case 'number':
                {
                  if (contentNode.content.length > 1) {
                    declarationNode.value = contentNode.content.join('');
                  } else {
                    _this4.process(contentNode, declarationNode);
                  }

                  break;
                }

              case 'parentheses':
                {
                  declarationNode.value = '(';

                  _this4.process(contentNode, declarationNode);

                  break;
                }

              default:
                {
                  _this4.process(contentNode, declarationNode);
                }
            }

            break;
          }

        default:
      }
    });

    if (!isBlockInside) {
      // Set parameters for Declaration node
      declarationNode.source = {
        start: node.start,
        end: node.end,
        input: this.input
      };
      declarationNode.parent = parent;
      parent.nodes.push(declarationNode);
    }

    this.raws.before = '';
    this.raws.customProperty = false;
    this.raws.multiRuleProp = '';
    this.raws.property = false;
  };

  _proto.customProperty = function customProperty(node, parent) {
    this.property(node, parent);
    parent.prop = "--" + parent.prop;
  };

  _proto.property = function property(node, parent) {
    // Set property for Declaration node
    switch (node.content[0].type) {
      case 'variable':
        {
          parent.prop += '$';
          break;
        }

      case 'interpolation':
        {
          this.raws.interpolation = true;
          parent.prop += '#{';
          break;
        }

      default:
    }

    parent.prop += node.content[0].content;

    if (this.raws.interpolation) {
      parent.prop += '}';
      this.raws.interpolation = false;
    }
  };

  _proto.value = function value(node, parent) {
    if (!parent.value) {
      parent.value = '';
    } // Set value for Declaration node


    if (node.content.length) {
      node.content.forEach(function (contentNode) {
        switch (contentNode.type) {
          case 'important':
            {
              parent.raws.important = contentNode.content;
              parent.important = true;
              var match = parent.value.match(/^(.*?)(\s*)$/);

              if (match) {
                parent.raws.important = match[2] + parent.raws.important;
                parent.value = match[1];
              }

              break;
            }

          case 'parentheses':
            {
              parent.value += contentNode.content.join('') + ')';
              break;
            }

          case 'percentage':
            {
              parent.value += contentNode.content.join('') + '%';
              break;
            }

          default:
            {
              if (contentNode.content.constructor === Array) {
                parent.value += contentNode.content.join('');
              } else {
                parent.value += contentNode.content;
              }
            }
        }
      });
    }
  };

  _proto.singlelineComment = function singlelineComment(node, parent) {
    return this.comment(node, parent, true);
  };

  _proto.multilineComment = function multilineComment(node, parent) {
    return this.comment(node, parent, false);
  };

  _proto.comment = function comment(node, parent, inline) {
    // https://github.com/nodesecurity/eslint-plugin-security#detect-unsafe-regex
    // eslint-disable-next-line security/detect-unsafe-regex
    var text = node.content.match(/^(\s*)((?:\S[\S\s]*?)?)(\s*)$/);
    this.raws.comment = true;
    var comment = Object.assign(postcss.comment(), {
      text: text[2],
      raws: {
        before: this.raws.before || DEFAULT_COMMENT_DECL.before,
        left: text[1],
        right: text[3],
        inline: inline
      },
      source: {
        start: {
          line: node.start.line,
          column: node.start.column
        },
        end: node.end,
        input: this.input
      },
      parent: parent
    });

    if (this.raws.beforeMulti) {
      comment.raws.before += this.raws.beforeMulti;
      this.raws.beforeMulti = undefined;
    }

    parent.nodes.push(comment);
    this.raws.before = '';
  };

  _proto.space = function space(node, parent) {
    // Spaces before root and rule
    switch (parent.type) {
      case 'root':
        {
          this.raws.before += node.content;
          break;
        }

      case 'rule':
        {
          if (this.raws.comment) {
            this.raws.before += node.content;
          } else if (this.raws.loop) {
            parent.selector += node.content;
          } else {
            this.raws.before = (this.raws.before || '\n') + node.content;
          }

          break;
        }

      default:
    }
  };

  _proto.declarationDelimiter = function declarationDelimiter(node) {
    this.raws.before += node.content;
  };

  _proto.loop = function loop(node, parent) {
    var _this5 = this;

    var loop = postcss.rule();
    this.raws.comment = false;
    this.raws.multiRule = false;
    this.raws.loop = true;
    loop.selector = '';
    loop.raws = {
      before: this.raws.before || DEFAULT_RAWS_RULE.before,
      between: DEFAULT_RAWS_RULE.between
    };

    if (this.raws.beforeMulti) {
      loop.raws.before += this.raws.beforeMulti;
      this.raws.beforeMulti = undefined;
    }

    node.content.forEach(function (contentNode, i) {
      if (node.content[i + 1] && node.content[i + 1].type === 'block') {
        _this5.raws.loop = false;
      }

      _this5.process(contentNode, loop);
    });
    parent.nodes.push(loop);
    this.raws.loop = false;
  };

  _proto.atrule = function atrule(node, parent) {
    var _this6 = this;

    // Skip unsupported @xxx rules
    var supportedNode = node.content[0].content.some(function (contentNode) {
      return SUPPORTED_AT_KEYWORDS.includes(contentNode.content);
    });
    if (!supportedNode) return;
    var atrule = postcss.rule();
    atrule.selector = '';
    atrule.raws = {
      before: this.raws.before || DEFAULT_RAWS_RULE.before,
      between: DEFAULT_RAWS_RULE.between
    };
    node.content.forEach(function (contentNode, i) {
      if (contentNode.type === 'space') {
        var prevNodeType = node.content[i - 1].type;

        switch (prevNodeType) {
          case 'atkeyword':
          case 'ident':
            atrule.selector += contentNode.content;
            break;

          default:
        }

        return;
      }

      _this6.process(contentNode, atrule);
    }); // atrule.parent = parent || {}
    // atrule.source = { input: {} }
    // parent.nodes.push(atrule)
  };

  _proto.parentheses = function parentheses(node, parent) {
    parent.selector += '(';
    node.content.forEach(function (contentNode) {
      if (typeof contentNode.content === 'string') {
        parent.selector += contentNode.content;
      }

      if (typeof contentNode.content === 'object') {
        contentNode.content.forEach(function (childrenContentNode) {
          if (contentNode.type === 'variable') parent.selector += '$';
          parent.selector += childrenContentNode.content;
        });
      }
    });
    parent.selector += ')';
  };

  _proto.interpolation = function interpolation(node, parent) {
    var _this7 = this;

    parent.selector += '#{';
    node.content.forEach(function (contentNode) {
      _this7.process(contentNode, parent);
    });
    parent.selector += '}';
  };

  _proto.atkeyword = function atkeyword(node, parent) {
    parent.selector += "@" + node.content;
  };

  _proto.operator = function operator(node, parent) {
    parent.selector += node.content;
  };

  _proto.variable = function variable(node, parent) {
    if (this.raws.loop) {
      parent.selector += "$" + node.content[0].content;
      return;
    }

    parent.selector += "$" + node.content;
  };

  _proto.ident = function ident(node, parent) {
    parent.selector += node.content;
  };

  return SassParser;
}();

module.exports = SassParser;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBhcnNlci5lczYiXSwibmFtZXMiOlsicG9zdGNzcyIsInJlcXVpcmUiLCJnb256YWxlcyIsIkRFRkFVTFRfUkFXU19ST09UIiwiYmVmb3JlIiwiREVGQVVMVF9SQVdTX1JVTEUiLCJiZXR3ZWVuIiwiREVGQVVMVF9SQVdTX0RFQ0wiLCJzZW1pY29sb24iLCJERUZBVUxUX0NPTU1FTlRfREVDTCIsIlNVUFBPUlRFRF9BVF9LRVlXT1JEUyIsIlNhc3NQYXJzZXIiLCJpbnB1dCIsInBhcnNlIiwibm9kZSIsImNzcyIsInN5bnRheCIsImVycm9yIiwibWVzc2FnZSIsImxpbmUiLCJsaW5lcyIsIm1hdGNoIiwicm9vdCIsInN0eWxlc2hlZXQiLCJleHRyYWN0U291cmNlIiwic3RhcnQiLCJlbmQiLCJub2RlTGluZXMiLCJzbGljZSIsInN1YnN0cmluZyIsImNvbHVtbiIsImxhc3QiLCJsZW5ndGgiLCJqb2luIiwic291cmNlIiwicmF3cyIsImNvbnRlbnQiLCJmb3JFYWNoIiwiY29udGVudE5vZGUiLCJwcm9jZXNzIiwicGFyZW50IiwidHlwZSIsInJ1bGVzZXQiLCJtdWx0aVJ1bGVQcm9wIiwicnVsZSIsInNlbGVjdG9yIiwicnVsZVJhd3MiLCJjb21tZW50IiwiZmlsdGVyIiwiaW5uZXJDb250ZW50Tm9kZSIsIm5vZGVzIiwicmVwbGFjZSIsInNwYWNlcyIsInB1c2giLCJibG9jayIsIm11bHRpUnVsZSIsIm11bHRpUnVsZVByb3BWYXJpYWJsZSIsIk9iamVjdCIsImFzc2lnbiIsImN1c3RvbVByb3BlcnR5IiwiYmVmb3JlTXVsdGkiLCJkZWNsYXJhdGlvbiIsImlzQmxvY2tJbnNpZGUiLCJkZWNsYXJhdGlvbk5vZGUiLCJkZWNsIiwicHJvcCIsImRlY2xhcmF0aW9uUmF3cyIsInByb3BlcnR5IiwiYmV0d2VlbkJlZm9yZSIsIkFycmF5IiwiaXNBcnJheSIsInZhbHVlIiwiaW50ZXJwb2xhdGlvbiIsImltcG9ydGFudCIsImNvbnN0cnVjdG9yIiwic2luZ2xlbGluZUNvbW1lbnQiLCJtdWx0aWxpbmVDb21tZW50IiwiaW5saW5lIiwidGV4dCIsImxlZnQiLCJyaWdodCIsInVuZGVmaW5lZCIsInNwYWNlIiwibG9vcCIsImRlY2xhcmF0aW9uRGVsaW1pdGVyIiwiaSIsImF0cnVsZSIsInN1cHBvcnRlZE5vZGUiLCJzb21lIiwiaW5jbHVkZXMiLCJwcmV2Tm9kZVR5cGUiLCJwYXJlbnRoZXNlcyIsImNoaWxkcmVuQ29udGVudE5vZGUiLCJhdGtleXdvcmQiLCJvcGVyYXRvciIsInZhcmlhYmxlIiwiaWRlbnQiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQU1BLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBdkI7O0FBQ0EsSUFBTUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsYUFBRCxDQUF4Qjs7QUFFQSxJQUFNRSxpQkFBaUIsR0FBRztBQUN0QkMsRUFBQUEsTUFBTSxFQUFFO0FBRGMsQ0FBMUI7QUFJQSxJQUFNQyxpQkFBaUIsR0FBRztBQUN0QkQsRUFBQUEsTUFBTSxFQUFFLEVBRGM7QUFFdEJFLEVBQUFBLE9BQU8sRUFBRTtBQUZhLENBQTFCO0FBS0EsSUFBTUMsaUJBQWlCLEdBQUc7QUFDdEJILEVBQUFBLE1BQU0sRUFBRSxFQURjO0FBRXRCRSxFQUFBQSxPQUFPLEVBQUUsRUFGYTtBQUd0QkUsRUFBQUEsU0FBUyxFQUFFO0FBSFcsQ0FBMUI7QUFNQSxJQUFNQyxvQkFBb0IsR0FBRztBQUN6QkwsRUFBQUEsTUFBTSxFQUFFO0FBRGlCLENBQTdCO0FBSUEsSUFBTU0scUJBQXFCLEdBQUcsQ0FBQyxPQUFELENBQTlCOztJQUVNQyxVO0FBQ0Ysc0JBQWFDLEtBQWIsRUFBb0I7QUFDaEIsU0FBS0EsS0FBTCxHQUFhQSxLQUFiO0FBQ0g7Ozs7U0FFREMsSyxHQUFBLGlCQUFTO0FBQ0wsUUFBSTtBQUNBLFdBQUtDLElBQUwsR0FBWVosUUFBUSxDQUFDVyxLQUFULENBQWUsS0FBS0QsS0FBTCxDQUFXRyxHQUExQixFQUErQjtBQUFF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QUFQLEVBQWEwQixNQUFiLEVBQXFCO0FBQ2pCQSxJQUFBQSxNQUFNLENBQUNLLFFBQVAsSUFBbUIvQixJQUFJLENBQUNzQixPQUF4QjtBQUNILEc7Ozs7O0FBR0w2RCxNQUFNLENBQUNDLE9BQVAsR0FBaUJ2RixVQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IHBvc3Rjc3MgPSByZXF1aXJlKCdwb3N0Y3NzJylcbmNvbnN0IGdvbnphbGVzID0gcmVxdWlyZSgnZ29uemFsZXMtcGUnKVxuXG5jb25zdCBERUZBVUxUX1JBV1NfUk9PVCA9IHtcbiAgICBiZWZvcmU6ICcnXG59XG5cbmNvbnN0IERFRkFVTFRfUkFXU19SVUxFID0ge1xuICAgIGJlZm9yZTogJycsXG4gICAgYmV0d2VlbjogJydcbn1cblxuY29uc3QgREVGQVVMVF9SQVdTX0RFQ0wgPSB7XG4gICAgYmVmb3JlOiAnJyxcbiAgICBiZXR3ZWVuOiAnJyxcbiAgICBzZW1pY29sb246IGZhbHNlXG59XG5cbmNvbnN0IERFRkFVTFRfQ09NTUVOVF9ERUNMID0ge1xuICAgIGJlZm9yZTogJydcbn1cblxuY29uc3QgU1VQUE9SVEVEX0FUX0tFWVdPUkRTID0gWydtZWRpYSddXG5cbmNsYXNzIFNhc3NQYXJzZXIge1xuICAgIGNvbnN0cnVjdG9yIChpbnB1dCkge1xuICAgICAgICB0aGlzLmlucHV0ID0gaW5wdXRcbiAgICB9XG5cbiAgICBwYXJzZSAoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLm5vZGUgPSBnb256YWxlcy5wYXJzZSh0aGlzLmlucHV0LmNzcywgeyBzeW50YXg6ICdzYXNzJyB9KVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgdGhpcy5pbnB1dC5lcnJvcihlcnJvci5tZXNzYWdlLCBlcnJvci5saW5lLCAxKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXMgPSB0aGlzLmlucHV0LmNzcy5tYXRjaCgvXi4qKFxccj9cXG58JCkvZ20pXG4gICAgICAgIHRoaXMucm9vdCA9IHRoaXMuc3R5bGVzaGVldCh0aGlzLm5vZGUpXG4gICAgfVxuXG4gICAgZXh0cmFjdFNvdXJjZSAoc3RhcnQsIGVuZCkge1xuICAgICAgICBsZXQgbm9kZUxpbmVzID0gdGhpcy5saW5lcy5zbGljZShzdGFydC5saW5lIC0gMSwgZW5kLmxpbmUpXG5cbiAgICAgICAgbm9kZUxpbmVzWzBdID0gbm9kZUxpbmVzWzBdLnN1YnN0cmluZyhzdGFydC5jb2x1bW4gLSAxKVxuICAgICAgICBsZXQgbGFzdCA9IG5vZGVMaW5lcy5sZW5ndGggLSAxXG4gICAgICAgIG5vZGVMaW5lc1tsYXN0XSA9IG5vZGVMaW5lc1tsYXN0XS5zdWJzdHJpbmcoMCwgZW5kLmNvbHVtbilcblxuICAgICAgICByZXR1cm4gbm9kZUxpbmVzLmpvaW4oJycpXG4gICAgfVxuXG4gICAgc3R5bGVzaGVldCAobm9kZSkge1xuICAgICAgICAvLyBDcmVhdGUgYW5kIHNldCBwYXJhbWV0ZXJzIGZvciBSb290IG5vZGVcbiAgICAgICAgbGV0IHJvb3QgPSBwb3N0Y3NzLnJvb3QoKVxuICAgICAgICByb290LnNvdXJjZSA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiBub2RlLnN0YXJ0LFxuICAgICAgICAgICAgZW5kOiBub2RlLmVuZCxcbiAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgIH1cbiAgICAgICAgLy8gUmF3cyBmb3Igcm9vdCBub2RlXG4gICAgICAgIHJvb3QucmF3cyA9IHtcbiAgICAgICAgICAgIHNlbWljb2xvbjogREVGQVVMVF9SQVdTX1JPT1Quc2VtaWNvbG9uLFxuICAgICAgICAgICAgYmVmb3JlOiBERUZBVUxUX1JBV1NfUk9PVC5iZWZvcmVcbiAgICAgICAgfVxuICAgICAgICAvLyBTdG9yZSBzcGFjZXMgYmVmb3JlIHJvb3QgKGlmIGV4aXN0KVxuICAgICAgICB0aGlzLnJhd3MgPSB7XG4gICAgICAgICAgICBiZWZvcmU6ICcnXG4gICAgICAgIH1cbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goY29udGVudE5vZGUgPT4gdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCByb290KSlcbiAgICAgICAgcmV0dXJuIHJvb3RcbiAgICB9XG5cbiAgICBwcm9jZXNzIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgaWYgKHRoaXNbbm9kZS50eXBlXSkgcmV0dXJuIHRoaXNbbm9kZS50eXBlXShub2RlLCBwYXJlbnQpIHx8IG51bGxcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBydWxlc2V0IChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgLy8gTG9vcCB0byBmaW5kIHRoZSBkZWVwZXN0IHJ1bGVzZXQgbm9kZVxuICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcCA9ICcnXG5cbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goY29udGVudE5vZGUgPT4ge1xuICAgICAgICAgICAgc3dpdGNoIChjb250ZW50Tm9kZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYmxvY2snOiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBSdWxlIG5vZGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJ1bGUgPSBwb3N0Y3NzLnJ1bGUoKVxuICAgICAgICAgICAgICAgICAgICBydWxlLnNlbGVjdG9yID0gJydcbiAgICAgICAgICAgICAgICAgICAgLy8gT2JqZWN0IHRvIHN0b3JlIHJhd3MgZm9yIFJ1bGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJ1bGVSYXdzID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgYmVmb3JlOiB0aGlzLnJhd3MuYmVmb3JlIHx8IERFRkFVTFRfUkFXU19SVUxFLmJlZm9yZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJldHdlZW46IERFRkFVTFRfUkFXU19SVUxFLmJldHdlZW5cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFZhcmlhYmxlIHRvIHN0b3JlIHNwYWNlcyBhbmQgc3ltYm9scyBiZWZvcmUgZGVjbGFyYXRpb24gcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSA9ICcnXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5jb21tZW50ID0gZmFsc2VcblxuICAgICAgICAgICAgICAgICAgICAvLyBMb29rIHVwIHRocm93IGFsbCBub2RlcyBpbiBjdXJyZW50IHJ1bGVzZXQgbm9kZVxuICAgICAgICAgICAgICAgICAgICBub2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoY29udGVudCA9PiBjb250ZW50LnR5cGUgPT09ICdibG9jaycpXG4gICAgICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaChpbm5lckNvbnRlbnROb2RlID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGlubmVyQ29udGVudE5vZGUsIHJ1bGUpXG4gICAgICAgICAgICAgICAgICAgICAgICApXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUubm9kZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXcml0ZSBzZWxlY3RvciB0byBSdWxlXG4gICAgICAgICAgICAgICAgICAgICAgICBydWxlLnNlbGVjdG9yID0gdGhpcy5leHRyYWN0U291cmNlKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUuc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudE5vZGUuc3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuc2xpY2UoMCwgLTEpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xccyskLywgc3BhY2VzID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVsZVJhd3MuYmV0d2VlbiA9IHNwYWNlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gJydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2V0IHBhcmFtZXRlcnMgZm9yIFJ1bGUgbm9kZVxuICAgICAgICAgICAgICAgICAgICAgICAgcnVsZS5wYXJlbnQgPSBwYXJlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHJ1bGUuc291cmNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBub2RlLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZDogbm9kZS5lbmQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQ6IHRoaXMuaW5wdXRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJ1bGUucmF3cyA9IHJ1bGVSYXdzXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQubm9kZXMucHVzaChydWxlKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgYmxvY2sgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICAvLyBJZiBuZXN0ZWQgcnVsZXMgZXhpc3QsIHdyYXAgY3VycmVudCBydWxlIGluIG5ldyBydWxlIG5vZGVcbiAgICAgICAgaWYgKHRoaXMucmF3cy5tdWx0aVJ1bGUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJhd3MubXVsdGlSdWxlUHJvcFZhcmlhYmxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZVByb3AgPSBgJCR7dGhpcy5yYXdzLm11bHRpUnVsZVByb3B9YFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IG11bHRpUnVsZSA9IE9iamVjdC5hc3NpZ24ocG9zdGNzcy5ydWxlKCksIHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IG5vZGUuc3RhcnQubGluZSAtIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW46IG5vZGUuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGVuZDogbm9kZS5lbmQsXG4gICAgICAgICAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICByYXdzOiB7XG4gICAgICAgICAgICAgICAgICAgIGJlZm9yZTogdGhpcy5yYXdzLmJlZm9yZSB8fCBERUZBVUxUX1JBV1NfUlVMRS5iZWZvcmUsXG4gICAgICAgICAgICAgICAgICAgIGJldHdlZW46IERFRkFVTFRfUkFXU19SVUxFLmJldHdlZW5cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBhcmVudCxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjpcbiAgICAgICAgICAgICAgICAgICAgKHRoaXMucmF3cy5jdXN0b21Qcm9wZXJ0eSA/ICctLScgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHBhcmVudC5wdXNoKG11bHRpUnVsZSlcbiAgICAgICAgICAgIHBhcmVudCA9IG11bHRpUnVsZVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSA9ICcnXG5cbiAgICAgICAgLy8gTG9va2luZyBmb3IgZGVjbGFyYXRpb24gbm9kZSBpbiBibG9jayBub2RlXG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgcGFyZW50KSlcbiAgICAgICAgaWYgKHRoaXMucmF3cy5tdWx0aVJ1bGUpIHtcbiAgICAgICAgICAgIHRoaXMucmF3cy5iZWZvcmVNdWx0aSA9IHRoaXMucmF3cy5iZWZvcmVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRlY2xhcmF0aW9uIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgbGV0IGlzQmxvY2tJbnNpZGUgPSBmYWxzZVxuICAgICAgICAvLyBDcmVhdGUgRGVjbGFyYXRpb24gbm9kZVxuICAgICAgICBsZXQgZGVjbGFyYXRpb25Ob2RlID0gcG9zdGNzcy5kZWNsKClcbiAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnByb3AgPSAnJ1xuXG4gICAgICAgIC8vIE9iamVjdCB0byBzdG9yZSByYXdzIGZvciBEZWNsYXJhdGlvblxuICAgICAgICBsZXQgZGVjbGFyYXRpb25SYXdzID0gT2JqZWN0LmFzc2lnbihkZWNsYXJhdGlvbk5vZGUucmF3cywge1xuICAgICAgICAgICAgYmVmb3JlOiB0aGlzLnJhd3MuYmVmb3JlIHx8IERFRkFVTFRfUkFXU19ERUNMLmJlZm9yZSxcbiAgICAgICAgICAgIGJldHdlZW46IERFRkFVTFRfUkFXU19ERUNMLmJldHdlZW4sXG4gICAgICAgICAgICBzZW1pY29sb246IERFRkFVTFRfUkFXU19ERUNMLnNlbWljb2xvblxuICAgICAgICB9KVxuXG4gICAgICAgIHRoaXMucmF3cy5wcm9wZXJ0eSA9IGZhbHNlXG4gICAgICAgIHRoaXMucmF3cy5iZXR3ZWVuQmVmb3JlID0gZmFsc2VcbiAgICAgICAgdGhpcy5yYXdzLmNvbW1lbnQgPSBmYWxzZVxuICAgICAgICAvLyBMb29raW5nIGZvciBwcm9wZXJ0eSBhbmQgdmFsdWUgbm9kZSBpbiBkZWNsYXJhdGlvbiBub2RlXG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAoY29udGVudE5vZGUudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2N1c3RvbVByb3BlcnR5JzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLmN1c3RvbVByb3BlcnR5ID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIGZhbGwgdGhyb3VnaFxuICAgICAgICAgICAgICAgIGNhc2UgJ3Byb3BlcnR5Jzoge1xuICAgICAgICAgICAgICAgICAgICAvKiB0aGlzLnJhd3MucHJvcGVydHkgdG8gZGV0ZWN0IGlzIHByb3BlcnR5IGlzIGFscmVhZHkgZGVmaW5lZCBpbiBjdXJyZW50IG9iamVjdCAqL1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MucHJvcGVydHkgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGVQcm9wID0gY29udGVudE5vZGUuY29udGVudFswXS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGVQcm9wVmFyaWFibGUgPVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudE5vZGUuY29udGVudFswXS50eXBlID09PSAndmFyaWFibGUnXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdwcm9wZXJ0eURlbGltaXRlcic6IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucmF3cy5wcm9wZXJ0eSAmJiAhdGhpcy5yYXdzLmJldHdlZW5CZWZvcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHByb3BlcnR5IGlzIGFscmVhZHkgZGVmaW5lZCBhbmQgdGhlcmUncyBubyAnOicgYmVmb3JlIGl0ICovXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvblJhd3MuYmV0d2VlbiArPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcCArPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiAnOicgZ29lcyBiZWZvcmUgcHJvcGVydHkgZGVjbGFyYXRpb24sIGxpa2UgOndpZHRoIDEwMHB4ICovXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MuYmV0d2VlbkJlZm9yZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlY2xhcmF0aW9uUmF3cy5iZWZvcmUgKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZVByb3AgKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3NwYWNlJzoge1xuICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvblJhd3MuYmV0d2VlbiArPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3ZhbHVlJzoge1xuICAgICAgICAgICAgICAgICAgICAvLyBMb29rIHVwIGZvciBhIHZhbHVlIGZvciBjdXJyZW50IHByb3BlcnR5XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAoY29udGVudE5vZGUuY29udGVudFswXS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdibG9jayc6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0Jsb2NrSW5zaWRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIG5lc3RlZCBydWxlcyBleGlzdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbnRlbnROb2RlLmNvbnRlbnRbMF0uY29udGVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLmNvbnRlbnRbMF0sIHBhcmVudClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAndmFyaWFibGUnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnZhbHVlID0gJyQnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCBkZWNsYXJhdGlvbk5vZGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbG9yJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlY2xhcmF0aW9uTm9kZS52YWx1ZSA9ICcjJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRlbnROb2RlLmNvbnRlbnQubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbk5vZGUudmFsdWUgPSBjb250ZW50Tm9kZS5jb250ZW50LmpvaW4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCBkZWNsYXJhdGlvbk5vZGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdwYXJlbnRoZXNlcyc6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbk5vZGUudmFsdWUgPSAnKCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGRlY2xhcmF0aW9uTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKCFpc0Jsb2NrSW5zaWRlKSB7XG4gICAgICAgICAgICAvLyBTZXQgcGFyYW1ldGVycyBmb3IgRGVjbGFyYXRpb24gbm9kZVxuICAgICAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnNvdXJjZSA9IHtcbiAgICAgICAgICAgICAgICBzdGFydDogbm9kZS5zdGFydCxcbiAgICAgICAgICAgICAgICBlbmQ6IG5vZGUuZW5kLFxuICAgICAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWNsYXJhdGlvbk5vZGUucGFyZW50ID0gcGFyZW50XG4gICAgICAgICAgICBwYXJlbnQubm9kZXMucHVzaChkZWNsYXJhdGlvbk5vZGUpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJhd3MuYmVmb3JlID0gJydcbiAgICAgICAgdGhpcy5yYXdzLmN1c3RvbVByb3BlcnR5ID0gZmFsc2VcbiAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZVByb3AgPSAnJ1xuICAgICAgICB0aGlzLnJhd3MucHJvcGVydHkgPSBmYWxzZVxuICAgIH1cblxuICAgIGN1c3RvbVByb3BlcnR5IChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgdGhpcy5wcm9wZXJ0eShub2RlLCBwYXJlbnQpXG4gICAgICAgIHBhcmVudC5wcm9wID0gYC0tJHtwYXJlbnQucHJvcH1gXG4gICAgfVxuXG4gICAgcHJvcGVydHkgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICAvLyBTZXQgcHJvcGVydHkgZm9yIERlY2xhcmF0aW9uIG5vZGVcbiAgICAgICAgc3dpdGNoIChub2RlLmNvbnRlbnRbMF0udHlwZSkge1xuICAgICAgICAgICAgY2FzZSAndmFyaWFibGUnOiB7XG4gICAgICAgICAgICAgICAgcGFyZW50LnByb3AgKz0gJyQnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ2ludGVycG9sYXRpb24nOiB7XG4gICAgICAgICAgICAgICAgdGhpcy5yYXdzLmludGVycG9sYXRpb24gPSB0cnVlXG4gICAgICAgICAgICAgICAgcGFyZW50LnByb3AgKz0gJyN7J1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICB9XG4gICAgICAgIHBhcmVudC5wcm9wICs9IG5vZGUuY29udGVudFswXS5jb250ZW50XG4gICAgICAgIGlmICh0aGlzLnJhd3MuaW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgcGFyZW50LnByb3AgKz0gJ30nXG4gICAgICAgICAgICB0aGlzLnJhd3MuaW50ZXJwb2xhdGlvbiA9IGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YWx1ZSAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIGlmICghcGFyZW50LnZhbHVlKSB7XG4gICAgICAgICAgICBwYXJlbnQudmFsdWUgPSAnJ1xuICAgICAgICB9XG4gICAgICAgIC8vIFNldCB2YWx1ZSBmb3IgRGVjbGFyYXRpb24gbm9kZVxuICAgICAgICBpZiAobm9kZS5jb250ZW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goY29udGVudE5vZGUgPT4ge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoY29udGVudE5vZGUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdpbXBvcnRhbnQnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQucmF3cy5pbXBvcnRhbnQgPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQuaW1wb3J0YW50ID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1hdGNoID0gcGFyZW50LnZhbHVlLm1hdGNoKC9eKC4qPykoXFxzKikkLylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudC5yYXdzLmltcG9ydGFudCA9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoWzJdICsgcGFyZW50LnJhd3MuaW1wb3J0YW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnZhbHVlID0gbWF0Y2hbMV1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FzZSAncGFyZW50aGVzZXMnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQudmFsdWUgKz0gY29udGVudE5vZGUuY29udGVudC5qb2luKCcnKSArICcpJ1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXNlICdwZXJjZW50YWdlJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnZhbHVlICs9IGNvbnRlbnROb2RlLmNvbnRlbnQuam9pbignJykgKyAnJSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRlbnROb2RlLmNvbnRlbnQuY29uc3RydWN0b3IgPT09IEFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnZhbHVlICs9IGNvbnRlbnROb2RlLmNvbnRlbnQuam9pbignJylcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnZhbHVlICs9IGNvbnRlbnROb2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzaW5nbGVsaW5lQ29tbWVudCAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbW1lbnQobm9kZSwgcGFyZW50LCB0cnVlKVxuICAgIH1cblxuICAgIG11bHRpbGluZUNvbW1lbnQgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb21tZW50KG5vZGUsIHBhcmVudCwgZmFsc2UpXG4gICAgfVxuXG4gICAgY29tbWVudCAobm9kZSwgcGFyZW50LCBpbmxpbmUpIHtcbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVzZWN1cml0eS9lc2xpbnQtcGx1Z2luLXNlY3VyaXR5I2RldGVjdC11bnNhZmUtcmVnZXhcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIHNlY3VyaXR5L2RldGVjdC11bnNhZmUtcmVnZXhcbiAgICAgICAgbGV0IHRleHQgPSBub2RlLmNvbnRlbnQubWF0Y2goL14oXFxzKikoKD86XFxTW1xcU1xcc10qPyk/KShcXHMqKSQvKVxuXG4gICAgICAgIHRoaXMucmF3cy5jb21tZW50ID0gdHJ1ZVxuXG4gICAgICAgIGxldCBjb21tZW50ID0gT2JqZWN0LmFzc2lnbihwb3N0Y3NzLmNvbW1lbnQoKSwge1xuICAgICAgICAgICAgdGV4dDogdGV4dFsyXSxcbiAgICAgICAgICAgIHJhd3M6IHtcbiAgICAgICAgICAgICAgICBiZWZvcmU6IHRoaXMucmF3cy5iZWZvcmUgfHwgREVGQVVMVF9DT01NRU5UX0RFQ0wuYmVmb3JlLFxuICAgICAgICAgICAgICAgIGxlZnQ6IHRleHRbMV0sXG4gICAgICAgICAgICAgICAgcmlnaHQ6IHRleHRbM10sXG4gICAgICAgICAgICAgICAgaW5saW5lXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc291cmNlOiB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgbGluZTogbm9kZS5zdGFydC5saW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2x1bW46IG5vZGUuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbmQ6IG5vZGUuZW5kLFxuICAgICAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGFyZW50XG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMucmF3cy5iZWZvcmVNdWx0aSkge1xuICAgICAgICAgICAgY29tbWVudC5yYXdzLmJlZm9yZSArPSB0aGlzLnJhd3MuYmVmb3JlTXVsdGlcbiAgICAgICAgICAgIHRoaXMucmF3cy5iZWZvcmVNdWx0aSA9IHVuZGVmaW5lZFxuICAgICAgICB9XG5cbiAgICAgICAgcGFyZW50Lm5vZGVzLnB1c2goY29tbWVudClcbiAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSA9ICcnXG4gICAgfVxuXG4gICAgc3BhY2UgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICAvLyBTcGFjZXMgYmVmb3JlIHJvb3QgYW5kIHJ1bGVcbiAgICAgICAgc3dpdGNoIChwYXJlbnQudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAncm9vdCc6IHtcbiAgICAgICAgICAgICAgICB0aGlzLnJhd3MuYmVmb3JlICs9IG5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICdydWxlJzoge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnJhd3MuY29tbWVudCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MuYmVmb3JlICs9IG5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5yYXdzLmxvb3ApIHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9IG5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5iZWZvcmUgPSAodGhpcy5yYXdzLmJlZm9yZSB8fCAnXFxuJykgKyBub2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkZWNsYXJhdGlvbkRlbGltaXRlciAobm9kZSkge1xuICAgICAgICB0aGlzLnJhd3MuYmVmb3JlICs9IG5vZGUuY29udGVudFxuICAgIH1cblxuICAgIGxvb3AgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICBsZXQgbG9vcCA9IHBvc3Rjc3MucnVsZSgpXG4gICAgICAgIHRoaXMucmF3cy5jb21tZW50ID0gZmFsc2VcbiAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZSA9IGZhbHNlXG4gICAgICAgIHRoaXMucmF3cy5sb29wID0gdHJ1ZVxuICAgICAgICBsb29wLnNlbGVjdG9yID0gJydcbiAgICAgICAgbG9vcC5yYXdzID0ge1xuICAgICAgICAgICAgYmVmb3JlOiB0aGlzLnJhd3MuYmVmb3JlIHx8IERFRkFVTFRfUkFXU19SVUxFLmJlZm9yZSxcbiAgICAgICAgICAgIGJldHdlZW46IERFRkFVTFRfUkFXU19SVUxFLmJldHdlZW5cbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yYXdzLmJlZm9yZU11bHRpKSB7XG4gICAgICAgICAgICBsb29wLnJhd3MuYmVmb3JlICs9IHRoaXMucmF3cy5iZWZvcmVNdWx0aVxuICAgICAgICAgICAgdGhpcy5yYXdzLmJlZm9yZU11bHRpID0gdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goKGNvbnRlbnROb2RlLCBpKSA9PiB7XG4gICAgICAgICAgICBpZiAobm9kZS5jb250ZW50W2kgKyAxXSAmJiBub2RlLmNvbnRlbnRbaSArIDFdLnR5cGUgPT09ICdibG9jaycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJhd3MubG9vcCA9IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGxvb3ApXG4gICAgICAgIH0pXG4gICAgICAgIHBhcmVudC5ub2Rlcy5wdXNoKGxvb3ApXG4gICAgICAgIHRoaXMucmF3cy5sb29wID0gZmFsc2VcbiAgICB9XG5cbiAgICBhdHJ1bGUgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICAvLyBTa2lwIHVuc3VwcG9ydGVkIEB4eHggcnVsZXNcbiAgICAgICAgbGV0IHN1cHBvcnRlZE5vZGUgPSBub2RlLmNvbnRlbnRbMF0uY29udGVudC5zb21lKGNvbnRlbnROb2RlID0+XG4gICAgICAgICAgICBTVVBQT1JURURfQVRfS0VZV09SRFMuaW5jbHVkZXMoY29udGVudE5vZGUuY29udGVudClcbiAgICAgICAgKVxuICAgICAgICBpZiAoIXN1cHBvcnRlZE5vZGUpIHJldHVyblxuXG4gICAgICAgIGxldCBhdHJ1bGUgPSBwb3N0Y3NzLnJ1bGUoKVxuICAgICAgICBhdHJ1bGUuc2VsZWN0b3IgPSAnJ1xuICAgICAgICBhdHJ1bGUucmF3cyA9IHtcbiAgICAgICAgICAgIGJlZm9yZTogdGhpcy5yYXdzLmJlZm9yZSB8fCBERUZBVUxUX1JBV1NfUlVMRS5iZWZvcmUsXG4gICAgICAgICAgICBiZXR3ZWVuOiBERUZBVUxUX1JBV1NfUlVMRS5iZXR3ZWVuXG4gICAgICAgIH1cbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goKGNvbnRlbnROb2RlLCBpKSA9PiB7XG4gICAgICAgICAgICBpZiAoY29udGVudE5vZGUudHlwZSA9PT0gJ3NwYWNlJykge1xuICAgICAgICAgICAgICAgIGxldCBwcmV2Tm9kZVR5cGUgPSBub2RlLmNvbnRlbnRbaSAtIDFdLnR5cGVcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHByZXZOb2RlVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdhdGtleXdvcmQnOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdpZGVudCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBhdHJ1bGUuc2VsZWN0b3IgKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGF0cnVsZSlcbiAgICAgICAgfSlcbiAgICAgICAgLy8gYXRydWxlLnBhcmVudCA9IHBhcmVudCB8fCB7fVxuICAgICAgICAvLyBhdHJ1bGUuc291cmNlID0geyBpbnB1dDoge30gfVxuICAgICAgICAvLyBwYXJlbnQubm9kZXMucHVzaChhdHJ1bGUpXG4gICAgfVxuXG4gICAgcGFyZW50aGVzZXMgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gJygnXG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29udGVudE5vZGUuY29udGVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRlbnROb2RlLmNvbnRlbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY29udGVudE5vZGUuY29udGVudC5mb3JFYWNoKGNoaWxkcmVuQ29udGVudE5vZGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29udGVudE5vZGUudHlwZSA9PT0gJ3ZhcmlhYmxlJykgcGFyZW50LnNlbGVjdG9yICs9ICckJ1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gY2hpbGRyZW5Db250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9ICcpJ1xuICAgIH1cblxuICAgIGludGVycG9sYXRpb24gKG5vZGUsIHBhcmVudCkge1xuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gJyN7J1xuICAgICAgICBub2RlLmNvbnRlbnQuZm9yRWFjaChjb250ZW50Tm9kZSA9PiB7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIHBhcmVudClcbiAgICAgICAgfSlcbiAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9ICd9J1xuICAgIH1cblxuICAgIGF0a2V5d29yZCAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBgQCR7bm9kZS5jb250ZW50fWBcbiAgICB9XG5cbiAgICBvcGVyYXRvciAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBub2RlLmNvbnRlbnRcbiAgICB9XG5cbiAgICB2YXJpYWJsZSAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIGlmICh0aGlzLnJhd3MubG9vcCkge1xuICAgICAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9IGAkJHtub2RlLmNvbnRlbnRbMF0uY29udGVudH1gXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gYCQke25vZGUuY29udGVudH1gXG4gICAgfVxuXG4gICAgaWRlbnQgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gbm9kZS5jb250ZW50XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNhc3NQYXJzZXJcbiJdfQ==