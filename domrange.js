// A constant empty array (frozen if the JS engine supports it).
var _emptyArray = Object.freeze ? Object.freeze([]) : [];

// `[new] Blaze.DOMRange([nodeAndRangeArray])`
//
// A DOMRange consists of an array of consecutive nodes and DOMRanges,
// which may be replaced at any time with a new array.  If the DOMRange
// has been attached to the DOM at some location, then updating
// the array will cause the DOM to be updated at that location.
Blaze.DOMRange = function (nodeAndRangeArray) {
  if (! (this instanceof Blaze.DOMRange))
    // called without `new`
    return new Blaze.DOMRange(nodeAndRangeArray);

  var members = (nodeAndRangeArray || _emptyArray);
  if (! (members && (typeof members.length) === 'number'))
    throw new Error("Expected array");

  for (var i = 0; i < members.length; i++)
    this._memberIn(members[i]);

  this.members = members;
  this.placeholderComment = null;
  this.attached = false;
  this.parentElement = null;
  this.parentRange = null;
  this.stopCallbacks = _emptyArray;
};

// static methods
_.extend(Blaze.DOMRange, {
  attach: function (rangeOrNode, parentElement, nextNode) {
    var m = rangeOrNode;
    if (m instanceof Blaze.DOMRange) {
      m.attach(parentElement, nextNode);
    } else {
      parentElement.insertBefore(m, nextNode || null);
    }
  },
  detach: function (rangeOrNode) {
    var m = rangeOrNode;
    if (m instanceof Blaze.DOMRange) {
      m.detach();
    } else {
      m.parentNode.removeChild(m);
    }
  },
  firstNode: function (rangeOrNode) {
    var m = rangeOrNode;
    return (m instanceof Blaze.DOMRange) ? m.firstNode() : m;
  },
  lastNode: function (rangeOrNode) {
    var m = rangeOrNode;
    return (m instanceof Blaze.DOMRange) ? m.lastNode() : m;
  }
});


_.extend(Blaze.DOMRange.prototype, {
  _memberIn: function (m) {
    if (m instanceof Blaze.DOMRange)
      m.parentRange = this;
    else if (m.nodeType === 1) // DOM Element
      m.$blaze_range = this;
  },
  _memberOut: function (m) {
    // old members are almost always GCed immediately.
    // to avoid the potentialy performance hit of deleting
    // a property, we simple null it out.
    if (m instanceof Blaze.DOMRange)
      m.parentRange = null;
    else if (m.nodeType === 1) // DOM Element
      m.$blaze_range = null;
  },
  attach: function (parentElement, nextNode) {
    // This method is called to insert the DOMRange into the DOM for
    // the first time, but it's also used internally when
    // updating the DOM.
    var members = this.members;
    if (members.length) {
      this.placeholderComment = null;
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.attach(members[i], parentElement, nextNode);
      }
    } else {
      var comment = document.createComment("empty");
      this.placeholderComment = comment;
      parentElement.insertBefore(comment, nextNode || null);
    }
    this.attached = true;
    this.parentElement = parentElement;
  },
  setMembers: function (newNodeAndRangeArray) {
    var newMembers = newNodeAndRangeArray;
    if (! (newMembers && (typeof newMembers.length) === 'number'))
      throw new Error("Expected array");

    var oldMembers = this.members;


    for (var i = 0; i < oldMembers.length; i++)
      this._memberOut(oldMembers[i]);
    for (var i = 0; i < newMembers.length; i++)
      this._memberIn(newMembers[i]);

    if (! this.attached) {
      this.members = newMembers;
    } else {
      // don't do anything if we're going from empty to empty
      if (newMembers.length || oldMembers.length) {
        // detach the old members and insert the new members
        var nextNode = this.lastNode().nextSibling;
        var parentElement = this.parentElement;
        this.detach();
        this.members = newMembers;
        this.attach(parentElement, nextNode);
      }
    }
  },
  firstNode: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! this.members.length)
      return this.placeholderComment;

    var m = this.members[0];
    return (m instanceof Blaze.DOMRange) ? m.firstNode() : m;
  },
  lastNode: function () {
    if (! this.attached)
      throw new Error("Must be attached");

    if (! this.members.length)
      return this.placeholderComment;

    var m = this.members[this.members.length - 1];
    return (m instanceof Blaze.DOMRange) ? m.lastNode() : m;
  },
  detach: function () {
    var members = this.members;
    if (members.length) {
      for (var i = 0; i < members.length; i++) {
        Blaze.DOMRange.detach(members[i]);
      }
    } else {
      var comment = this.placeholderComment;
      this.parentElement.removeChild(comment);
      this.placeholderComment = null;
    }
    this.attached = false;
    this.parentElement = null;
  },
  addMember: function (newMember, atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex <= members.length))
      throw new Error("Bad index in range.addMember: " + atIndex);

    this._memberIn(newMember);

    if (! this.attached) {
      // currently detached; just updated members
      members.splice(atIndex, 0, newMember);
    } else if (members.length === 0) {
      // empty; use the empty-to-nonempty handling of setMembers
      this.setMembers([newMember]);
    } else {
      var nextNode;
      if (atIndex === members.length) {
        // insert at end
        nextNode = this.lastNode().nextSibling;
      } else {
        nextNode = Blaze.DOMRange.firstNode(members[atIndex]);
      }
      members.splice(atIndex, 0, newMember);
      Blaze.DOMRange.attach(newMember, this.parentElement, nextNode);
    }
  },
  removeMember: function (atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex < members.length))
      throw new Error("Bad index in range.removeMember: " + atIndex);

    var oldMember = members[atIndex];
    this._memberOut(oldMember);

    if (members.length === 1) {
      // becoming empty; use the logic in setMembers
      this.setMembers(_emptyArray);
    } else {
      members.splice(atIndex, 1);
      if (this.attached)
        Blaze.DOMRange.detach(oldMember);
    }
  },
  getMember: function (atIndex) {
    var members = this.members;
    if (! (atIndex >= 0 && atIndex < members.length))
      throw new Error("Bad index in range.getMember: " + atIndex);
    return this.members[atIndex];
  },
  stop: function () {
    var stopCallbacks = this.stopCallbacks;
    for (var i = 0; i < stopCallbacks.length; i++)
      stopCallbacks[i].call(this);
    this.stopCallbacks = _emptyArray;
  },
  onstop: function (cb) {
    if (this.stopCallbacks === _emptyArray)
      this.stopCallbacks = [];
    this.stopCallbacks.push(cb);
  }
});
