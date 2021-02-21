"use strict";

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var Stringifier = require('postcss/lib/stringifier');

module.exports = /*#__PURE__*/function (_Stringifier) {
  _inheritsLoose(SassStringifier, _Stringifier);

  function SassStringifier() {
    return _Stringifier.apply(this, arguments) || this;
  }

  var _proto = SassStringifier.prototype;

  _proto.block = function block(node, start) {
    this.builder(start, node, 'start');

    if (node.nodes && node.nodes.length) {
      this.body(node);
    }
  };

  _proto.decl = function decl(node) {
    _Stringifier.prototype.decl.call(this, node, false);
  };

  _proto.comment = function comment(node) {
    var left = this.raw(node, 'left', 'commentLeft');
    var right = this.raw(node, 'right', 'commentRight');

    if (node.raws.inline) {
      this.builder('//' + left + node.text + right, node);
    } else {
      this.builder('/*' + left + node.text + right + '*/', node);
    }
  };

  return SassStringifier;
}(Stringifier);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInN0cmluZ2lmaWVyLmVzNiJdLCJuYW1lcyI6WyJTdHJpbmdpZmllciIsInJlcXVpcmUiLCJtb2R1bGUiLCJleHBvcnRzIiwiYmxvY2siLCJub2RlIiwic3RhcnQiLCJidWlsZGVyIiwibm9kZXMiLCJsZW5ndGgiLCJib2R5IiwiZGVjbCIsImNvbW1lbnQiLCJsZWZ0IiwicmF3IiwicmlnaHQiLCJyYXdzIiwiaW5saW5lIiwidGV4dCJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBTUEsV0FBVyxHQUFHQyxPQUFPLENBQUMseUJBQUQsQ0FBM0I7O0FBRUFDLE1BQU0sQ0FBQ0MsT0FBUDtBQUFBOztBQUFBO0FBQUE7QUFBQTs7QUFBQTs7QUFBQSxTQUNJQyxLQURKLEdBQ0ksZUFBT0MsSUFBUCxFQUFhQyxLQUFiLEVBQW9CO0FBQ2hCLFNBQUtDLE9BQUwsQ0FBYUQsS0FBYixFQUFvQkQsSUFBcEIsRUFBMEIsT0FBMUI7O0FBQ0EsUUFBSUEsSUFBSSxDQUFDRyxLQUFMLElBQWNILElBQUksQ0FBQ0csS0FBTCxDQUFXQyxNQUE3QixFQUFxQztBQUNqQyxXQUFLQyxJQUFMLENBQVVMLElBQVY7QUFDSDtBQUNKLEdBTkw7O0FBQUEsU0FRSU0sSUFSSixHQVFJLGNBQU1OLElBQU4sRUFBWTtBQUNSLDJCQUFNTSxJQUFOLFlBQVdOLElBQVgsRUFBaUIsS0FBakI7QUFDSCxHQVZMOztBQUFBLFNBWUlPLE9BWkosR0FZSSxpQkFBU1AsSUFBVCxFQUFlO0FBQ1gsUUFBSVEsSUFBSSxHQUFHLEtBQUtDLEdBQUwsQ0FBU1QsSUFBVCxFQUFlLE1BQWYsRUFBdUIsYUFBdkIsQ0FBWDtBQUNBLFFBQUlVLEtBQUssR0FBRyxLQUFLRCxHQUFMLENBQVNULElBQVQsRUFBZSxPQUFmLEVBQXdCLGNBQXhCLENBQVo7O0FBRUEsUUFBSUEsSUFBSSxDQUFDVyxJQUFMLENBQVVDLE1BQWQsRUFBc0I7QUFDbEIsV0FBS1YsT0FBTCxDQUFhLE9BQU9NLElBQVAsR0FBY1IsSUFBSSxDQUFDYSxJQUFuQixHQUEwQkgsS0FBdkMsRUFBOENWLElBQTlDO0FBQ0gsS0FGRCxNQUVPO0FBQ0gsV0FBS0UsT0FBTCxDQUFhLE9BQU9NLElBQVAsR0FBY1IsSUFBSSxDQUFDYSxJQUFuQixHQUEwQkgsS0FBMUIsR0FBa0MsSUFBL0MsRUFBcURWLElBQXJEO0FBQ0g7QUFDSixHQXJCTDs7QUFBQTtBQUFBLEVBQStDTCxXQUEvQyIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFN0cmluZ2lmaWVyID0gcmVxdWlyZSgncG9zdGNzcy9saWIvc3RyaW5naWZpZXInKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFNhc3NTdHJpbmdpZmllciBleHRlbmRzIFN0cmluZ2lmaWVyIHtcbiAgICBibG9jayAobm9kZSwgc3RhcnQpIHtcbiAgICAgICAgdGhpcy5idWlsZGVyKHN0YXJ0LCBub2RlLCAnc3RhcnQnKVxuICAgICAgICBpZiAobm9kZS5ub2RlcyAmJiBub2RlLm5vZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5ib2R5KG5vZGUpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkZWNsIChub2RlKSB7XG4gICAgICAgIHN1cGVyLmRlY2wobm9kZSwgZmFsc2UpXG4gICAgfVxuXG4gICAgY29tbWVudCAobm9kZSkge1xuICAgICAgICBsZXQgbGVmdCA9IHRoaXMucmF3KG5vZGUsICdsZWZ0JywgJ2NvbW1lbnRMZWZ0JylcbiAgICAgICAgbGV0IHJpZ2h0ID0gdGhpcy5yYXcobm9kZSwgJ3JpZ2h0JywgJ2NvbW1lbnRSaWdodCcpXG5cbiAgICAgICAgaWYgKG5vZGUucmF3cy5pbmxpbmUpIHtcbiAgICAgICAgICAgIHRoaXMuYnVpbGRlcignLy8nICsgbGVmdCArIG5vZGUudGV4dCArIHJpZ2h0LCBub2RlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5idWlsZGVyKCcvKicgKyBsZWZ0ICsgbm9kZS50ZXh0ICsgcmlnaHQgKyAnKi8nLCBub2RlKVxuICAgICAgICB9XG4gICAgfVxufVxuIl19