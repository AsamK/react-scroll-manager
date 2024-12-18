function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

import React from 'react';
import PropTypes from 'prop-types';
import timedMutationObserver from './timedMutationObserver';
import debugFn from 'debug';
const debug = debugFn('ScrollManager');
const ManagerContext = React.createContext();
const defaultTimeout = 3000;
export class ScrollManager extends React.Component {
  constructor(props) {
    super(props);
    const history = props.history,
          _props$sessionKey = props.sessionKey,
          sessionKey = _props$sessionKey === void 0 ? 'ScrollManager' : _props$sessionKey,
          _props$timeout = props.timeout,
          timeout = _props$timeout === void 0 ? defaultTimeout : _props$timeout;

    if ('scrollRestoration' in window.history) {
      this._originalScrollRestoration = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    } // load positions and associated tracking data from session state


    try {
      const data = sessionStorage.getItem(sessionKey);
      this._session = JSON.parse(data || '{}');
    } catch (e) {
      debug('Error reading session storage:', e.message);
      this._session = {};
    }

    this._positions = this._session.positions || (this._session.positions = {});
    this._locations = this._session.locations || (this._session.locations = []);
    this._historyStart = history.length - this._locations.length;
    const initialKey = 'initial';
    this._locationKey = this._session.locationKey || initialKey; // initialize emphemeral state of scrollable nodes

    this._scrollableNodes = {};
    this._deferredNodes = {};
    window.addEventListener('beforeunload', () => {
      // write everything back to session state on unload
      this._savePositions();

      this._session.locationKey = this._locationKey;

      try {
        sessionStorage.setItem(sessionKey, JSON.stringify(this._session));
      } catch (e) {// session state full or unavailable
      }
    });
    this._historyChanged = true;
    this._unlisten = history.listen((location, action) => {
      this._historyChanged = true;

      this._savePositions(); // cancel any pending hash scroller


      if (this._hashScroller) {
        this._hashScroller.cancel();

        this._hashScroller = null;
      } // clean up positions no longer in history to avoid leaking memory
      // (including last history element if action is PUSH or REPLACE)


      const locationCount = Math.max(0, history.length - this._historyStart - (action !== 'POP' ? 1 : 0));

      while (this._locations.length > locationCount) {
        const key = this._locations.pop();

        delete this._positions[key];
      }

      const key = location.key || initialKey;

      if (action !== 'POP') {
        // track the new location key in our array of locations
        this._locations.push(key);

        this._historyStart = history.length - this._locations.length; // check for hash links that need deferral of scrolling into view

        if (typeof location.hash === 'string' && location.hash.length > 1) {
          const elementId = location.hash.substring(1);
          this._hashScroller = timedMutationObserver(() => {
            const element = document.getElementById(elementId);

            if (element) {
              debug("Scrolling element ".concat(elementId, " into view"));
              element.scrollIntoView();
              return true;
            }

            return false;
          }, timeout);

          this._hashScroller.catch(e => {
            if (!e.cancelled) {
              debug("Timeout scrolling hash element ".concat(elementId, " into view"));
            }
          });
        }
      } // set current location key for saving position on next history change


      this._locationKey = key;
    });
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }

    if (this._originalScrollRestoration) {
      window.history.scrollRestoration = this._originalScrollRestoration;
    }
  }

  render() {
    return /*#__PURE__*/React.createElement(ManagerContext.Provider, {
      value: this
    }, this.props.children);
  }

  _registerElement(scrollKey, node) {
    this._scrollableNodes[scrollKey] = node;

    this._restoreNode(scrollKey);
  }

  _unregisterElement(scrollKey) {
    delete this._scrollableNodes[scrollKey];
  }

  _savePositions() {
    // use pageXOffset instead of scrollX for IE compatibility
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX#Notes
    const _window = window,
          scrollX = _window.pageXOffset,
          scrollY = _window.pageYOffset;

    this._savePosition('window', {
      scrollX,
      scrollY
    });

    for (const scrollKey in this._scrollableNodes) {
      const node = this._scrollableNodes[scrollKey];
      const scrollLeft = node.scrollLeft,
            scrollTop = node.scrollTop;

      this._savePosition(scrollKey, {
        scrollLeft,
        scrollTop
      });
    }
  }

  _savePosition(scrollKey, position) {
    debug('save', this._locationKey, scrollKey, position);

    if (!(scrollKey in this._deferredNodes)) {
      let loc = this._positions[this._locationKey];

      if (!loc) {
        loc = this._positions[this._locationKey] = {};
      }

      loc[scrollKey] = position;
    } else {
      debug("Skipping save due to deferred scroll of ".concat(scrollKey));
    }
  }

  _loadPosition(scrollKey) {
    const loc = this._positions[this._locationKey];
    return loc ? loc[scrollKey] || null : null;
  }

  _restoreNode(scrollKey) {
    this._historyChanged = false;

    const position = this._loadPosition(scrollKey);

    const _ref = position || {},
          _ref$scrollLeft = _ref.scrollLeft,
          scrollLeft = _ref$scrollLeft === void 0 ? 0 : _ref$scrollLeft,
          _ref$scrollTop = _ref.scrollTop,
          scrollTop = _ref$scrollTop === void 0 ? 0 : _ref$scrollTop;

    debug('restore', this._locationKey, scrollKey, scrollLeft, scrollTop);

    this._cancelDeferred(scrollKey);

    const node = this._scrollableNodes[scrollKey];

    const attemptScroll = () => {
      node.scrollLeft = scrollLeft;
      node.scrollTop = scrollTop;
      return node.scrollLeft === scrollLeft && node.scrollTop === scrollTop;
    };

    if (!attemptScroll()) {
      const failedScroll = () => {
        debug("Could not scroll ".concat(scrollKey, " to (").concat(scrollLeft, ", ").concat(scrollTop, ")") + "; scroll size is (".concat(node.scrollWidth, ", ").concat(node.scrollHeight, ")"));
      };

      const _this$props$timeout = this.props.timeout,
            timeout = _this$props$timeout === void 0 ? defaultTimeout : _this$props$timeout;

      if (timeout) {
        debug("Deferring scroll of ".concat(scrollKey, " for up to ").concat(timeout, " ms"));
        (this._deferredNodes[scrollKey] = timedMutationObserver(attemptScroll, timeout, node)).then(() => delete this._deferredNodes[scrollKey]).catch(e => {
          if (!e.cancelled) failedScroll();
        });
      } else {
        failedScroll();
      }
    }
  }

  _restoreWindow() {
    this._historyChanged = false;
    const scrollKey = 'window';

    const position = this._loadPosition(scrollKey);

    const _ref2 = position || {},
          _ref2$scrollX = _ref2.scrollX,
          scrollX = _ref2$scrollX === void 0 ? 0 : _ref2$scrollX,
          _ref2$scrollY = _ref2.scrollY,
          scrollY = _ref2$scrollY === void 0 ? 0 : _ref2$scrollY;

    debug('restore', this._locationKey, scrollKey, scrollX, scrollY);

    this._cancelDeferred(scrollKey);

    const attemptScroll = () => {
      window.scrollTo(scrollX, scrollY);
      return window.pageXOffset === scrollX && window.pageYOffset === scrollY;
    };

    if (!attemptScroll()) {
      const failedScroll = () => {
        debug("Could not scroll ".concat(scrollKey, " to (").concat(scrollX, ", ").concat(scrollY, ")") + "; scroll size is (".concat(document.body.scrollWidth, ", ").concat(document.body.scrollHeight, ")"));
      };

      const _this$props$timeout2 = this.props.timeout,
            timeout = _this$props$timeout2 === void 0 ? defaultTimeout : _this$props$timeout2;

      if (timeout) {
        debug("Deferring scroll of ".concat(scrollKey, " for up to ").concat(timeout, " ms"));
        (this._deferredNodes[scrollKey] = timedMutationObserver(attemptScroll, timeout)).then(() => delete this._deferredNodes[scrollKey]).catch(e => {
          if (!e.cancelled) failedScroll();
        });
      } else {
        failedScroll();
      }
    }
  }

  _restoreInitial() {
    if (!location.hash) {
      this._restoreWindow();
    }
  }

  _cancelDeferred(scrollKey) {
    const deferred = this._deferredNodes[scrollKey];

    if (deferred) {
      debug("Cancelling deferred scroll of ".concat(scrollKey));
      delete this._deferredNodes[scrollKey];
      deferred.cancel();
    }
  }

}
ScrollManager.propTypes = {
  history: PropTypes.object.isRequired,
  sessionKey: PropTypes.string,
  timeout: PropTypes.number,
  children: PropTypes.node
};
export function withManager(Component) {
  return function ManagedComponent(props) {
    return /*#__PURE__*/React.createElement(ManagerContext.Consumer, null, manager => /*#__PURE__*/React.createElement(Component, _extends({}, props, {
      manager: manager
    })));
  };
}