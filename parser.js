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

var SassParser = /*#__PURE__*/function () {
  function SassParser(input) {
    this.input = input;
  }

  var _proto = SassParser.prototype;

  _proto.parse = function parse() {
    try {
      this.node = gonzales.parse(this.input.css, {
        syntax: 'sass'
      }); // disable loops, since the linter crashes with it atm

      this.node.content = this.node.content.filter(function (el) {
        return el.type !== 'loop';
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

  _proto.atrule = function atrule(node, parent) {};

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
    var _this6 = this;

    parent.selector += '#{';
    node.content.forEach(function (contentNode) {
      _this6.process(contentNode, parent);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBhcnNlci5lczYiXSwibmFtZXMiOlsicG9zdGNzcyIsInJlcXVpcmUiLCJnb256YWxlcyIsIkRFRkFVTFRfUkFXU19ST09UIiwiYmVmb3JlIiwiREVGQVVMVF9SQVdTX1JVTEUiLCJiZXR3ZWVuIiwiREVGQVVMVF9SQVdTX0RFQ0wiLCJzZW1pY29sb24iLCJERUZBVUxUX0NPTU1FTlRfREVDTCIsIlNhc3NQYXJzZXIiLCJpbnB1dCIsInBhcnNlIiwibm9kZSIsImNzcyIsInN5bnRheCIsImNvbnRlbnQiLCJmaWx0ZXIiLCJlbCIsInR5cGUiLCJlcnJvciIsIm1lc3NhZ2UiLCJsaW5lIiwibGluZXMiLCJtYXRjaCIsInJvb3QiLCJzdHlsZXNoZWV0IiwiZXh0cmFjdFNvdXJjZSIsInN0YXJ0IiwiZW5kIiwibm9kZUxpbmVzIiwic2xpY2UiLCJzdWJzdHJpbmciLCJjb2x1bW4iLCJsYXN0IiwibGVuZ3RoIiwiam9pbiIsInNvdXJjZSIsInJhd3MiLCJmb3JFYWNoIiwiY29udGVudE5vZGUiLCJwcm9jZXNzIiwicGFyZW50IiwicnVsZXNldCIsIm11bHRpUnVsZVByb3AiLCJydWxlIiwic2VsZWN0b3IiLCJydWxlUmF3cyIsImNvbW1lbnQiLCJpbm5lckNvbnRlbnROb2RlIiwibm9kZXMiLCJyZXBsYWNlIiwic3BhY2VzIiwicHVzaCIsImJsb2NrIiwibXVsdGlSdWxlIiwibXVsdGlSdWxlUHJvcFZhcmlhYmxlIiwiT2JqZWN0IiwiYXNzaWduIiwiY3VzdG9tUHJvcGVydHkiLCJiZWZvcmVNdWx0aSIsImRlY2xhcmF0aW9uIiwiaXNCbG9ja0luc2lkZSIsImRlY2xhcmF0aW9uTm9kZSIsImRlY2wiLCJwcm9wIiwiZGVjbGFyYXRpb25SYXdzIiwicHJvcGVydHkiLCJiZXR3ZWVuQmVmb3JlIiwiQXJyYXkiLCJpc0FycmF5IiwidmFsdWUiLCJpbnRlcnBvbGF0aW9uIiwiaW1wb3J0YW50IiwiY29uc3RydWN0b3IiLCJzaW5nbGVsaW5lQ29tbWVudCIsIm11bHRpbGluZUNvbW1lbnQiLCJpbmxpbmUiLCJ0ZXh0IiwibGVmdCIsInJpZ2h0IiwidW5kZWZpbmVkIiwic3BhY2UiLCJsb29wIiwiZGVjbGFyYXRpb25EZWxpbWl0ZXIiLCJpIiwiYXRydWxlIiwicGFyZW50aGVzZXMiLCJjaGlsZHJlbkNvbnRlbnROb2RlIiwiYXRrZXl3b3JkIiwib3BlcmF0b3IiLCJ2YXJpYWJsZSIsImlkZW50IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxJQUFNQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQXZCOztBQUNBLElBQU1DLFFBQVEsR0FBR0QsT0FBTyxDQUFDLGFBQUQsQ0FBeEI7O0FBRUEsSUFBTUUsaUJBQWlCLEdBQUc7QUFDdEJDLEVBQUFBLE1BQU0sRUFBRTtBQURjLENBQTFCO0FBSUEsSUFBTUMsaUJBQWlCLEdBQUc7QUFDdEJELEVBQUFBLE1BQU0sRUFBRSxFQURjO0FBRXRCRSxFQUFBQSxPQUFPLEVBQUU7QUFGYSxDQUExQjtBQUtBLElBQU1DLGlCQUFpQixHQUFHO0FBQ3RCSCxFQUFBQSxNQUFNLEVBQUUsRUFEYztBQUV0QkUsRUFBQUEsT0FBTyxFQUFFLEVBRmE7QUFHdEJFLEVBQUFBLFNBQVMsRUFBRTtBQUhXLENBQTFCO0FBTUEsSUFBTUMsb0JBQW9CLEdBQUc7QUFDekJMLEVBQUFBLE1BQU0sRUFBRTtBQURpQixDQUE3Qjs7SUFJTU0sVTtBQUNGLHNCQUFhQyxLQUFiLEVBQW9CO0FBQ2hCLFNBQUtBLEtBQUwsR0FBYUEsS0FBYjtBQUNIOzs7O1NBRURDLEssR0FBQSxpQkFBUztBQUNMLFFBQUk7QUFDQSxXQUFLQyxJQUFMLEdBQVlYLFFBQVEsQ0FBQ1UsS0FBVCxDQUFlLEtBQUtELEtBQUwsQ0FBV0csR0FBMUIsRUFBK0I7QUFBRUMsUUFBQUEsTUFBTSxFQUFFO0FBQVYsT0FBL0IsQ0FBWixDQURBLENBRUE7O0FBQ0EsV0FBS0YsSUFBTCxDQUFVRyxPQUFWLEdBQW9CLEtBQUtILElBQUwsQ0FBVUcsT0FBVixDQUFrQkMs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T0FBTCxDQUFhLENBQWIsRUFBZ0JBLE9BQXZDO0FBQ0E7QUFDSDs7QUFDRDBCLElBQUFBLE1BQU0sQ0FBQ0ksUUFBUCxVQUF1QmpDLElBQUksQ0FBQ0csT0FBNUI7QUFDSCxHOztTQUVENEUsSyxHQUFBLGVBQU8vRSxJQUFQLEVBQWE2QixNQUFiLEVBQXFCO0FBQ2pCQSxJQUFBQSxNQUFNLENBQUNJLFFBQVAsSUFBbUJqQyxJQUFJLENBQUNHLE9BQXhCO0FBQ0gsRzs7Ozs7QUFHTDZFLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQnBGLFVBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgcG9zdGNzcyA9IHJlcXVpcmUoJ3Bvc3Rjc3MnKVxuY29uc3QgZ29uemFsZXMgPSByZXF1aXJlKCdnb256YWxlcy1wZScpXG5cbmNvbnN0IERFRkFVTFRfUkFXU19ST09UID0ge1xuICAgIGJlZm9yZTogJydcbn1cblxuY29uc3QgREVGQVVMVF9SQVdTX1JVTEUgPSB7XG4gICAgYmVmb3JlOiAnJyxcbiAgICBiZXR3ZWVuOiAnJ1xufVxuXG5jb25zdCBERUZBVUxUX1JBV1NfREVDTCA9IHtcbiAgICBiZWZvcmU6ICcnLFxuICAgIGJldHdlZW46ICcnLFxuICAgIHNlbWljb2xvbjogZmFsc2Vcbn1cblxuY29uc3QgREVGQVVMVF9DT01NRU5UX0RFQ0wgPSB7XG4gICAgYmVmb3JlOiAnJ1xufVxuXG5jbGFzcyBTYXNzUGFyc2VyIHtcbiAgICBjb25zdHJ1Y3RvciAoaW5wdXQpIHtcbiAgICAgICAgdGhpcy5pbnB1dCA9IGlucHV0XG4gICAgfVxuXG4gICAgcGFyc2UgKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5ub2RlID0gZ29uemFsZXMucGFyc2UodGhpcy5pbnB1dC5jc3MsIHsgc3ludGF4OiAnc2FzcycgfSlcbiAgICAgICAgICAgIC8vIGRpc2FibGUgbG9vcHMsIHNpbmNlIHRoZSBsaW50ZXIgY3Jhc2hlcyB3aXRoIGl0IGF0bVxuICAgICAgICAgICAgdGhpcy5ub2RlLmNvbnRlbnQgPSB0aGlzLm5vZGUuY29udGVudC5maWx0ZXIoZWwgPT4gZWwudHlwZSAhPT0gJ2xvb3AnKVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgdGhpcy5pbnB1dC5lcnJvcihlcnJvci5tZXNzYWdlLCBlcnJvci5saW5lLCAxKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXMgPSB0aGlzLmlucHV0LmNzcy5tYXRjaCgvXi4qKFxccj9cXG58JCkvZ20pXG4gICAgICAgIHRoaXMucm9vdCA9IHRoaXMuc3R5bGVzaGVldCh0aGlzLm5vZGUpXG4gICAgfVxuXG4gICAgZXh0cmFjdFNvdXJjZSAoc3RhcnQsIGVuZCkge1xuICAgICAgICBsZXQgbm9kZUxpbmVzID0gdGhpcy5saW5lcy5zbGljZShzdGFydC5saW5lIC0gMSwgZW5kLmxpbmUpXG5cbiAgICAgICAgbm9kZUxpbmVzWzBdID0gbm9kZUxpbmVzWzBdLnN1YnN0cmluZyhzdGFydC5jb2x1bW4gLSAxKVxuICAgICAgICBsZXQgbGFzdCA9IG5vZGVMaW5lcy5sZW5ndGggLSAxXG4gICAgICAgIG5vZGVMaW5lc1tsYXN0XSA9IG5vZGVMaW5lc1tsYXN0XS5zdWJzdHJpbmcoMCwgZW5kLmNvbHVtbilcblxuICAgICAgICByZXR1cm4gbm9kZUxpbmVzLmpvaW4oJycpXG4gICAgfVxuXG4gICAgc3R5bGVzaGVldCAobm9kZSkge1xuICAgICAgICAvLyBDcmVhdGUgYW5kIHNldCBwYXJhbWV0ZXJzIGZvciBSb290IG5vZGVcbiAgICAgICAgbGV0IHJvb3QgPSBwb3N0Y3NzLnJvb3QoKVxuICAgICAgICByb290LnNvdXJjZSA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiBub2RlLnN0YXJ0LFxuICAgICAgICAgICAgZW5kOiBub2RlLmVuZCxcbiAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgIH1cbiAgICAgICAgLy8gUmF3cyBmb3Igcm9vdCBub2RlXG4gICAgICAgIHJvb3QucmF3cyA9IHtcbiAgICAgICAgICAgIHNlbWljb2xvbjogREVGQVVMVF9SQVdTX1JPT1Quc2VtaWNvbG9uLFxuICAgICAgICAgICAgYmVmb3JlOiBERUZBVUxUX1JBV1NfUk9PVC5iZWZvcmVcbiAgICAgICAgfVxuICAgICAgICAvLyBTdG9yZSBzcGFjZXMgYmVmb3JlIHJvb3QgKGlmIGV4aXN0KVxuICAgICAgICB0aGlzLnJhd3MgPSB7XG4gICAgICAgICAgICBiZWZvcmU6ICcnXG4gICAgICAgIH1cbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goY29udGVudE5vZGUgPT4gdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCByb290KSlcbiAgICAgICAgcmV0dXJuIHJvb3RcbiAgICB9XG5cbiAgICBwcm9jZXNzIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgaWYgKHRoaXNbbm9kZS50eXBlXSkgcmV0dXJuIHRoaXNbbm9kZS50eXBlXShub2RlLCBwYXJlbnQpIHx8IG51bGxcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBydWxlc2V0IChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgLy8gTG9vcCB0byBmaW5kIHRoZSBkZWVwZXN0IHJ1bGVzZXQgbm9kZVxuICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcCA9ICcnXG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAoY29udGVudE5vZGUudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jsb2NrJzoge1xuICAgICAgICAgICAgICAgICAgICAvLyBDcmVhdGUgUnVsZSBub2RlXG4gICAgICAgICAgICAgICAgICAgIGxldCBydWxlID0gcG9zdGNzcy5ydWxlKClcbiAgICAgICAgICAgICAgICAgICAgcnVsZS5zZWxlY3RvciA9ICcnXG4gICAgICAgICAgICAgICAgICAgIC8vIE9iamVjdCB0byBzdG9yZSByYXdzIGZvciBSdWxlXG4gICAgICAgICAgICAgICAgICAgIGxldCBydWxlUmF3cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZTogdGhpcy5yYXdzLmJlZm9yZSB8fCBERUZBVUxUX1JBV1NfUlVMRS5iZWZvcmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBiZXR3ZWVuOiBERUZBVUxUX1JBV1NfUlVMRS5iZXR3ZWVuXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBWYXJpYWJsZSB0byBzdG9yZSBzcGFjZXMgYW5kIHN5bWJvbHMgYmVmb3JlIGRlY2xhcmF0aW9uIHByb3BlcnR5XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5iZWZvcmUgPSAnJ1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MuY29tbWVudCA9IGZhbHNlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTG9vayB1cCB0aHJvdyBhbGwgbm9kZXMgaW4gY3VycmVudCBydWxlc2V0IG5vZGVcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGNvbnRlbnQgPT4gY29udGVudC50eXBlID09PSAnYmxvY2snKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmZvckVhY2goaW5uZXJDb250ZW50Tm9kZSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhpbm5lckNvbnRlbnROb2RlLCBydWxlKVxuICAgICAgICAgICAgICAgICAgICAgICAgKVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLm5vZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV3JpdGUgc2VsZWN0b3IgdG8gUnVsZVxuICAgICAgICAgICAgICAgICAgICAgICAgcnVsZS5zZWxlY3RvciA9IHRoaXMuZXh0cmFjdFNvdXJjZShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnROb2RlLnN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnNsaWNlKDAsIC0xKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrJC8sIHNwYWNlcyA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJ1bGVSYXdzLmJldHdlZW4gPSBzcGFjZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNldCBwYXJhbWV0ZXJzIGZvciBSdWxlIG5vZGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHJ1bGUucGFyZW50ID0gcGFyZW50XG4gICAgICAgICAgICAgICAgICAgICAgICBydWxlLnNvdXJjZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogbm9kZS5zdGFydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmQ6IG5vZGUuZW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0OiB0aGlzLmlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBydWxlLnJhd3MgPSBydWxlUmF3c1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Lm5vZGVzLnB1c2gocnVsZSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIGJsb2NrIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgLy8gSWYgbmVzdGVkIHJ1bGVzIGV4aXN0LCB3cmFwIGN1cnJlbnQgcnVsZSBpbiBuZXcgcnVsZSBub2RlXG4gICAgICAgIGlmICh0aGlzLnJhd3MubXVsdGlSdWxlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYXdzLm11bHRpUnVsZVByb3BWYXJpYWJsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGVQcm9wID0gYCQke3RoaXMucmF3cy5tdWx0aVJ1bGVQcm9wfWBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBtdWx0aVJ1bGUgPSBPYmplY3QuYXNzaWduKHBvc3Rjc3MucnVsZSgpLCB7XG4gICAgICAgICAgICAgICAgc291cmNlOiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiBub2RlLnN0YXJ0LmxpbmUgLSAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uOiBub2RlLnN0YXJ0LmNvbHVtblxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG5vZGUuZW5kLFxuICAgICAgICAgICAgICAgICAgICBpbnB1dDogdGhpcy5pbnB1dFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgcmF3czoge1xuICAgICAgICAgICAgICAgICAgICBiZWZvcmU6IHRoaXMucmF3cy5iZWZvcmUgfHwgREVGQVVMVF9SQVdTX1JVTEUuYmVmb3JlLFxuICAgICAgICAgICAgICAgICAgICBiZXR3ZWVuOiBERUZBVUxUX1JBV1NfUlVMRS5iZXR3ZWVuXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXJlbnQsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6XG4gICAgICAgICAgICAgICAgICAgICh0aGlzLnJhd3MuY3VzdG9tUHJvcGVydHkgPyAnLS0nIDogJycpICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZVByb3BcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBwYXJlbnQucHVzaChtdWx0aVJ1bGUpXG4gICAgICAgICAgICBwYXJlbnQgPSBtdWx0aVJ1bGVcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmF3cy5iZWZvcmUgPSAnJ1xuXG4gICAgICAgIC8vIExvb2tpbmcgZm9yIGRlY2xhcmF0aW9uIG5vZGUgaW4gYmxvY2sgbm9kZVxuICAgICAgICBub2RlLmNvbnRlbnQuZm9yRWFjaChjb250ZW50Tm9kZSA9PiB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIHBhcmVudCkpXG4gICAgICAgIGlmICh0aGlzLnJhd3MubXVsdGlSdWxlKSB7XG4gICAgICAgICAgICB0aGlzLnJhd3MuYmVmb3JlTXVsdGkgPSB0aGlzLnJhd3MuYmVmb3JlXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkZWNsYXJhdGlvbiAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIGxldCBpc0Jsb2NrSW5zaWRlID0gZmFsc2VcbiAgICAgICAgLy8gQ3JlYXRlIERlY2xhcmF0aW9uIG5vZGVcbiAgICAgICAgbGV0IGRlY2xhcmF0aW9uTm9kZSA9IHBvc3Rjc3MuZGVjbCgpXG4gICAgICAgIGRlY2xhcmF0aW9uTm9kZS5wcm9wID0gJydcblxuICAgICAgICAvLyBPYmplY3QgdG8gc3RvcmUgcmF3cyBmb3IgRGVjbGFyYXRpb25cbiAgICAgICAgbGV0IGRlY2xhcmF0aW9uUmF3cyA9IE9iamVjdC5hc3NpZ24oZGVjbGFyYXRpb25Ob2RlLnJhd3MsIHtcbiAgICAgICAgICAgIGJlZm9yZTogdGhpcy5yYXdzLmJlZm9yZSB8fCBERUZBVUxUX1JBV1NfREVDTC5iZWZvcmUsXG4gICAgICAgICAgICBiZXR3ZWVuOiBERUZBVUxUX1JBV1NfREVDTC5iZXR3ZWVuLFxuICAgICAgICAgICAgc2VtaWNvbG9uOiBERUZBVUxUX1JBV1NfREVDTC5zZW1pY29sb25cbiAgICAgICAgfSlcblxuICAgICAgICB0aGlzLnJhd3MucHJvcGVydHkgPSBmYWxzZVxuICAgICAgICB0aGlzLnJhd3MuYmV0d2VlbkJlZm9yZSA9IGZhbHNlXG4gICAgICAgIHRoaXMucmF3cy5jb21tZW50ID0gZmFsc2VcbiAgICAgICAgLy8gTG9va2luZyBmb3IgcHJvcGVydHkgYW5kIHZhbHVlIG5vZGUgaW4gZGVjbGFyYXRpb24gbm9kZVxuICAgICAgICBub2RlLmNvbnRlbnQuZm9yRWFjaChjb250ZW50Tm9kZSA9PiB7XG4gICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnROb2RlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdjdXN0b21Qcm9wZXJ0eSc6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5jdXN0b21Qcm9wZXJ0eSA9IHRydWVcbiAgICAgICAgICAgICAgICAvLyBmYWxsIHRocm91Z2hcbiAgICAgICAgICAgICAgICBjYXNlICdwcm9wZXJ0eSc6IHtcbiAgICAgICAgICAgICAgICAgICAgLyogdGhpcy5yYXdzLnByb3BlcnR5IHRvIGRldGVjdCBpcyBwcm9wZXJ0eSBpcyBhbHJlYWR5IGRlZmluZWQgaW4gY3VycmVudCBvYmplY3QgKi9cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLnByb3BlcnR5ID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcCA9IGNvbnRlbnROb2RlLmNvbnRlbnRbMF0uY29udGVudFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MubXVsdGlSdWxlUHJvcFZhcmlhYmxlID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnROb2RlLmNvbnRlbnRbMF0udHlwZSA9PT0gJ3ZhcmlhYmxlJ1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGRlY2xhcmF0aW9uTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAncHJvcGVydHlEZWxpbWl0ZXInOiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnJhd3MucHJvcGVydHkgJiYgIXRoaXMucmF3cy5iZXR3ZWVuQmVmb3JlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiBwcm9wZXJ0eSBpcyBhbHJlYWR5IGRlZmluZWQgYW5kIHRoZXJlJ3Mgbm8gJzonIGJlZm9yZSBpdCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVjbGFyYXRpb25SYXdzLmJldHdlZW4gKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLm11bHRpUnVsZVByb3AgKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgJzonIGdvZXMgYmVmb3JlIHByb3BlcnR5IGRlY2xhcmF0aW9uLCBsaWtlIDp3aWR0aCAxMDBweCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLmJldHdlZW5CZWZvcmUgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvblJhd3MuYmVmb3JlICs9IGNvbnRlbnROb2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGVQcm9wICs9IGNvbnRlbnROb2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzcGFjZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgZGVjbGFyYXRpb25SYXdzLmJldHdlZW4gKz0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICd2YWx1ZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTG9vayB1cCBmb3IgYSB2YWx1ZSBmb3IgY3VycmVudCBwcm9wZXJ0eVxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnROb2RlLmNvbnRlbnRbMF0udHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnYmxvY2snOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNCbG9ja0luc2lkZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBuZXN0ZWQgcnVsZXMgZXhpc3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb250ZW50Tm9kZS5jb250ZW50WzBdLmNvbnRlbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZS5jb250ZW50WzBdLCBwYXJlbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3ZhcmlhYmxlJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlY2xhcmF0aW9uTm9kZS52YWx1ZSA9ICckJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdjb2xvcic6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWNsYXJhdGlvbk5vZGUudmFsdWUgPSAnIydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGRlY2xhcmF0aW9uTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb250ZW50Tm9kZS5jb250ZW50Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnZhbHVlID0gY29udGVudE5vZGUuY29udGVudC5qb2luKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAncGFyZW50aGVzZXMnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnZhbHVlID0gJygnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCBkZWNsYXJhdGlvbk5vZGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3MoY29udGVudE5vZGUsIGRlY2xhcmF0aW9uTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICghaXNCbG9ja0luc2lkZSkge1xuICAgICAgICAgICAgLy8gU2V0IHBhcmFtZXRlcnMgZm9yIERlY2xhcmF0aW9uIG5vZGVcbiAgICAgICAgICAgIGRlY2xhcmF0aW9uTm9kZS5zb3VyY2UgPSB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IG5vZGUuc3RhcnQsXG4gICAgICAgICAgICAgICAgZW5kOiBub2RlLmVuZCxcbiAgICAgICAgICAgICAgICBpbnB1dDogdGhpcy5pbnB1dFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVjbGFyYXRpb25Ob2RlLnBhcmVudCA9IHBhcmVudFxuICAgICAgICAgICAgcGFyZW50Lm5vZGVzLnB1c2goZGVjbGFyYXRpb25Ob2RlKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSA9ICcnXG4gICAgICAgIHRoaXMucmF3cy5jdXN0b21Qcm9wZXJ0eSA9IGZhbHNlXG4gICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGVQcm9wID0gJydcbiAgICAgICAgdGhpcy5yYXdzLnByb3BlcnR5ID0gZmFsc2VcbiAgICB9XG5cbiAgICBjdXN0b21Qcm9wZXJ0eSAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHRoaXMucHJvcGVydHkobm9kZSwgcGFyZW50KVxuICAgICAgICBwYXJlbnQucHJvcCA9IGAtLSR7cGFyZW50LnByb3B9YFxuICAgIH1cblxuICAgIHByb3BlcnR5IChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgLy8gU2V0IHByb3BlcnR5IGZvciBEZWNsYXJhdGlvbiBub2RlXG4gICAgICAgIHN3aXRjaCAobm9kZS5jb250ZW50WzBdLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3ZhcmlhYmxlJzoge1xuICAgICAgICAgICAgICAgIHBhcmVudC5wcm9wICs9ICckJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICdpbnRlcnBvbGF0aW9uJzoge1xuICAgICAgICAgICAgICAgIHRoaXMucmF3cy5pbnRlcnBvbGF0aW9uID0gdHJ1ZVxuICAgICAgICAgICAgICAgIHBhcmVudC5wcm9wICs9ICcjeydcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnQucHJvcCArPSBub2RlLmNvbnRlbnRbMF0uY29udGVudFxuICAgICAgICBpZiAodGhpcy5yYXdzLmludGVycG9sYXRpb24pIHtcbiAgICAgICAgICAgIHBhcmVudC5wcm9wICs9ICd9J1xuICAgICAgICAgICAgdGhpcy5yYXdzLmludGVycG9sYXRpb24gPSBmYWxzZVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFsdWUgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICBpZiAoIXBhcmVudC52YWx1ZSkge1xuICAgICAgICAgICAgcGFyZW50LnZhbHVlID0gJydcbiAgICAgICAgfVxuICAgICAgICAvLyBTZXQgdmFsdWUgZm9yIERlY2xhcmF0aW9uIG5vZGVcbiAgICAgICAgaWYgKG5vZGUuY29udGVudC5sZW5ndGgpIHtcbiAgICAgICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGNvbnRlbnROb2RlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnaW1wb3J0YW50Jzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnJhd3MuaW1wb3J0YW50ID0gY29udGVudE5vZGUuY29udGVudFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LmltcG9ydGFudCA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtYXRjaCA9IHBhcmVudC52YWx1ZS5tYXRjaCgvXiguKj8pKFxccyopJC8pXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQucmF3cy5pbXBvcnRhbnQgPVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaFsyXSArIHBhcmVudC5yYXdzLmltcG9ydGFudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudC52YWx1ZSA9IG1hdGNoWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3BhcmVudGhlc2VzJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50LnZhbHVlICs9IGNvbnRlbnROb2RlLmNvbnRlbnQuam9pbignJykgKyAnKSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FzZSAncGVyY2VudGFnZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudC52YWx1ZSArPSBjb250ZW50Tm9kZS5jb250ZW50LmpvaW4oJycpICsgJyUnXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb250ZW50Tm9kZS5jb250ZW50LmNvbnN0cnVjdG9yID09PSBBcnJheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudC52YWx1ZSArPSBjb250ZW50Tm9kZS5jb250ZW50LmpvaW4oJycpXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudC52YWx1ZSArPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2luZ2xlbGluZUNvbW1lbnQgKG5vZGUsIHBhcmVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb21tZW50KG5vZGUsIHBhcmVudCwgdHJ1ZSlcbiAgICB9XG5cbiAgICBtdWx0aWxpbmVDb21tZW50IChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29tbWVudChub2RlLCBwYXJlbnQsIGZhbHNlKVxuICAgIH1cblxuICAgIGNvbW1lbnQgKG5vZGUsIHBhcmVudCwgaW5saW5lKSB7XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2Rlc2VjdXJpdHkvZXNsaW50LXBsdWdpbi1zZWN1cml0eSNkZXRlY3QtdW5zYWZlLXJlZ2V4XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBzZWN1cml0eS9kZXRlY3QtdW5zYWZlLXJlZ2V4XG4gICAgICAgIGxldCB0ZXh0ID0gbm9kZS5jb250ZW50Lm1hdGNoKC9eKFxccyopKCg/OlxcU1tcXFNcXHNdKj8pPykoXFxzKikkLylcblxuICAgICAgICB0aGlzLnJhd3MuY29tbWVudCA9IHRydWVcblxuICAgICAgICBsZXQgY29tbWVudCA9IE9iamVjdC5hc3NpZ24ocG9zdGNzcy5jb21tZW50KCksIHtcbiAgICAgICAgICAgIHRleHQ6IHRleHRbMl0sXG4gICAgICAgICAgICByYXdzOiB7XG4gICAgICAgICAgICAgICAgYmVmb3JlOiB0aGlzLnJhd3MuYmVmb3JlIHx8IERFRkFVTFRfQ09NTUVOVF9ERUNMLmJlZm9yZSxcbiAgICAgICAgICAgICAgICBsZWZ0OiB0ZXh0WzFdLFxuICAgICAgICAgICAgICAgIHJpZ2h0OiB0ZXh0WzNdLFxuICAgICAgICAgICAgICAgIGlubGluZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNvdXJjZToge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IG5vZGUuc3RhcnQubGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uOiBub2RlLnN0YXJ0LmNvbHVtblxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZW5kOiBub2RlLmVuZCxcbiAgICAgICAgICAgICAgICBpbnB1dDogdGhpcy5pbnB1dFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhcmVudFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICh0aGlzLnJhd3MuYmVmb3JlTXVsdGkpIHtcbiAgICAgICAgICAgIGNvbW1lbnQucmF3cy5iZWZvcmUgKz0gdGhpcy5yYXdzLmJlZm9yZU11bHRpXG4gICAgICAgICAgICB0aGlzLnJhd3MuYmVmb3JlTXVsdGkgPSB1bmRlZmluZWRcbiAgICAgICAgfVxuXG4gICAgICAgIHBhcmVudC5ub2Rlcy5wdXNoKGNvbW1lbnQpXG4gICAgICAgIHRoaXMucmF3cy5iZWZvcmUgPSAnJ1xuICAgIH1cblxuICAgIHNwYWNlIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgLy8gU3BhY2VzIGJlZm9yZSByb290IGFuZCBydWxlXG4gICAgICAgIHN3aXRjaCAocGFyZW50LnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3Jvb3QnOiB7XG4gICAgICAgICAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSArPSBub2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAncnVsZSc6IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5yYXdzLmNvbW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSArPSBub2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucmF3cy5sb29wKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBub2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJhd3MuYmVmb3JlID0gKHRoaXMucmF3cy5iZWZvcmUgfHwgJ1xcbicpICsgbm9kZS5jb250ZW50XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZGVjbGFyYXRpb25EZWxpbWl0ZXIgKG5vZGUpIHtcbiAgICAgICAgdGhpcy5yYXdzLmJlZm9yZSArPSBub2RlLmNvbnRlbnRcbiAgICB9XG5cbiAgICBsb29wIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgbGV0IGxvb3AgPSBwb3N0Y3NzLnJ1bGUoKVxuICAgICAgICB0aGlzLnJhd3MuY29tbWVudCA9IGZhbHNlXG4gICAgICAgIHRoaXMucmF3cy5tdWx0aVJ1bGUgPSBmYWxzZVxuICAgICAgICB0aGlzLnJhd3MubG9vcCA9IHRydWVcbiAgICAgICAgbG9vcC5zZWxlY3RvciA9ICcnXG4gICAgICAgIGxvb3AucmF3cyA9IHtcbiAgICAgICAgICAgIGJlZm9yZTogdGhpcy5yYXdzLmJlZm9yZSB8fCBERUZBVUxUX1JBV1NfUlVMRS5iZWZvcmUsXG4gICAgICAgICAgICBiZXR3ZWVuOiBERUZBVUxUX1JBV1NfUlVMRS5iZXR3ZWVuXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMucmF3cy5iZWZvcmVNdWx0aSkge1xuICAgICAgICAgICAgbG9vcC5yYXdzLmJlZm9yZSArPSB0aGlzLnJhd3MuYmVmb3JlTXVsdGlcbiAgICAgICAgICAgIHRoaXMucmF3cy5iZWZvcmVNdWx0aSA9IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKChjb250ZW50Tm9kZSwgaSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5vZGUuY29udGVudFtpICsgMV0gJiYgbm9kZS5jb250ZW50W2kgKyAxXS50eXBlID09PSAnYmxvY2snKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yYXdzLmxvb3AgPSBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzKGNvbnRlbnROb2RlLCBsb29wKVxuICAgICAgICB9KVxuICAgICAgICBwYXJlbnQubm9kZXMucHVzaChsb29wKVxuICAgICAgICB0aGlzLnJhd3MubG9vcCA9IGZhbHNlXG4gICAgfVxuXG4gICAgYXRydWxlIChub2RlLCBwYXJlbnQpIHtcbiAgICB9XG5cbiAgICBwYXJlbnRoZXNlcyAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSAnKCdcbiAgICAgICAgbm9kZS5jb250ZW50LmZvckVhY2goY29udGVudE5vZGUgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250ZW50Tm9kZS5jb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBjb250ZW50Tm9kZS5jb250ZW50XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29udGVudE5vZGUuY29udGVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50Tm9kZS5jb250ZW50LmZvckVhY2goY2hpbGRyZW5Db250ZW50Tm9kZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb250ZW50Tm9kZS50eXBlID09PSAndmFyaWFibGUnKSBwYXJlbnQuc2VsZWN0b3IgKz0gJyQnXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBjaGlsZHJlbkNvbnRlbnROb2RlLmNvbnRlbnRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gJyknXG4gICAgfVxuXG4gICAgaW50ZXJwb2xhdGlvbiAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSAnI3snXG4gICAgICAgIG5vZGUuY29udGVudC5mb3JFYWNoKGNvbnRlbnROb2RlID0+IHtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzcyhjb250ZW50Tm9kZSwgcGFyZW50KVxuICAgICAgICB9KVxuICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gJ30nXG4gICAgfVxuXG4gICAgYXRrZXl3b3JkIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9IGBAJHtub2RlLmNvbnRlbnR9YFxuICAgIH1cblxuICAgIG9wZXJhdG9yIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgcGFyZW50LnNlbGVjdG9yICs9IG5vZGUuY29udGVudFxuICAgIH1cblxuICAgIHZhcmlhYmxlIChub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgaWYgKHRoaXMucmF3cy5sb29wKSB7XG4gICAgICAgICAgICBwYXJlbnQuc2VsZWN0b3IgKz0gYCQke25vZGUuY29udGVudFswXS5jb250ZW50fWBcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBgJCR7bm9kZS5jb250ZW50fWBcbiAgICB9XG5cbiAgICBpZGVudCAobm9kZSwgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5zZWxlY3RvciArPSBub2RlLmNvbnRlbnRcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gU2Fzc1BhcnNlclxuIl19