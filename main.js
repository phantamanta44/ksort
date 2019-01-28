(() => {

  // GENERAL UTILS

  Object.prototype.also = function(consumer) {
    consumer(this);
    return this;
  };

  const log2 = num => Math.ceil(Math.log(num) / Math.log(2));

  // DEFINES

  const generateElem = (type, clazz, content) => document.createElement(type)
      .also(elem => elem.setAttribute('class', clazz))
      .also(elem => elem.innerHTML = content);
  const generateBanElem = name => generateElem('label', 'ban-elem',
      '<input type="checkbox" class="ban-elem-control" checked><span class="ban-elem-label"></span>')
      .also(elem => elem.children[1].innerText = name);
  const generateSortElem = (index, name) => generateElem('div', 'sort-elem',
      '<span class="sort-elem-index"></span><span class="sort-elem-name"></span>')
      .also(elem => elem.children[0].innerText = index + 1)
      .also(elem => elem.children[1].innerText = name);
  const generateBannedElem = name => generateElem('div', 'sort-elem banned',
      '<span class="sort-elem-index">X</span><span class="sort-elem-name"></span>')
      .also(elem => elem.children[1].innerText = name);
  const $id = id => document.getElementById(id);

  const wrapper = $id('wrapper');
  const banList = $id('ban-list');
  const sortList = $id('sort-list');
  const statusStage = $id('sort-status-stage-name');
  const statusProg = $id('sort-status-progress-num');
  const statusBar = $id('sort-status-progress-bar');
  const controlUndo = $id('sort-control-undo');
  const controlRedo = $id('sort-control-redo');
  const selectLeft = $id('sort-selection-left');
  const selectRight = $id('sort-selection-right');
  const stage2 = $id('stage-2');

  let statusText = null;
  const setStatusStage = name => statusText = statusStage.innerText = name;
  let progress = 0;
  const setStatusBar = frac => {
    progress = frac;
    statusProg.innerText = statusBar.style.width = `${Math.floor(frac * 1000) / 10}%`;
  };
  const selection = {
    left: null,
    right: null
  };
  const setSelection = (left, right) => {
    selection.left = selectLeft.innerText = left;
    selection.right = selectRight.innerText = right;
  };

  class ActionStack {

    constructor(elem) {
      this.elem = elem;
      this.stack = [];
    }

    isNotEmpty() {
      return this.stack.length !== 0;
    }

    peek() {
      return this.stack[this.stack.length - 1];
    }

    push(item) {
      this.stack.push(item);
      this.elem.classList.remove('disabled');
    }

    pop() {
      if (this.stack.length === 1) {
        this.elem.classList.add('disabled');
      }
      return this.stack.pop();
    }

    clear() {
      this.stack.length = 0;
      this.elem.classList.add('disabled');
    }

  }

  // SORTING STUFF

  const parentOf = index => Math.floor(index / 2);
  const lChildOf = index => index * 2;
  const rChildOf = index => index * 2 + 1;

  const dequeue = state => {
    console.log('Transition to dequeue');
    state.heap.swap(1, state.bound - 1);
    if (--state.bound > 2) {
      setStatusStage('drain');
      return percolateDown1(state, 1);
    } else {
      setStatusStage('done');
      setStatusBar(1);
      stage2.classList.add('done');
      state.next = null;
      console.log(`Finished in ${state.counter} steps`);
    }
  };

  const percolateDown1 = (state, index) => {
    console.log('Transition to percolateDown1');
    const lch = lChildOf(index);
    const rch = rChildOf(index);
    if (rch >= state.bound) {
      return percolateDown2(state, index, lch);
    }
    setSelection(state.heap.hget(lch), state.heap.hget(rch));
    const length = state.heap.length + 1;
    setStatusBar(1 - state.bound / length / 2 + log2(index) / state.heap.levels() / length / 2);
    return rHigherPri => {
      state.next = percolateDown2(state, index, rHigherPri ? lch : rch);
    };
  };

  const percolateDown2 = (state, index, child) => {
    console.log('Transition to percolateDown2');
    setSelection(state.heap.hget(index), state.heap.hget(child));
    const length = state.heap.length + 1;
    setStatusBar(1 - state.bound / length / 2 + (0.5 + log2(index)) / state.heap.levels() / length / 2);
    return rHigherPri => {
      if (rHigherPri) {
        state.next = dequeue(state);
      } else {
        state.heap.swap(index, child);
        state.next = lChildOf(child) >= state.bound ? dequeue(state) : percolateDown1(state, child);
      }
    };
  };

  const enqueue = state => {
    console.log('Transition to enqueue');
    if (++state.bound <= state.heap.length) {
      setStatusStage('heapify');
      return percolateUp(state, state.bound);
    } else {
      return dequeue(state);
    }
  };

  const percolateUp = (state, index) => {
    console.log('Transition to percolateUp');
    const parent = parentOf(index);
    setSelection(state.heap.hget(parent), state.heap.hget(index));
    const levels = state.heap.levels();
    setStatusBar(((state.bound - 2) + (levels - log2(index)) / levels) / 2 / (state.heap.length - 1));
    return rHigherPri => {
      if (rHigherPri) {
        state.next = enqueue(state);
      } else {
        state.heap.swap(index, parent);
        state.next = parent === 1 ? enqueue(state) : percolateUp(state, parent);
      }
    };
  };

  // APPLICATION CODE

  let state = null;
  const undoStack = new ActionStack(controlUndo);
  const redoStack = new ActionStack(controlRedo);
  const init = baseline => {
    const heap = [], banned = [];
    for (let i = 0; i < baseline.length; i++) {
      (banList.children[i].children[0].checked ? heap : banned).push(baseline[i]);
    }
    if (heap.length < 2) {
      alert('Must be at least two items!');
      return;
    }
    state = {
      heap,
      bound: 1,
      comparisons: new Map(),
      counter: 0
    };
    let listHead;
    // noinspection JSAssignmentUsedAsCondition
    while (listHead = sortList.firstElementChild) {
      listHead.remove();
    }
    for (let i = 0; i < heap.length; i++) {
      state.comparisons.set(heap[i], new Map());
      sortList.appendChild(generateSortElem(i, heap[i]));
    }
    for (const bannedEntry of banned) {
      sortList.appendChild(generateBannedElem(bannedEntry));
    }
    state.heap.hget = function(index) {
      return this[index - 1];
    };
    state.heap.hset = function(index, item) {
      this[index - 1] = sortList.children[index - 1].children[1].innerText = item;
    };
    state.heap.unswap = function(indexA, indexB) {
      const temp = this.hget(indexA);
      this.hset(indexA, this.hget(indexB));
      this.hset(indexB, temp);
    };
    state.heap.swap = function(indexA, indexB) {
      undoStack.peek().swaps.push([indexA, indexB]);
      this.unswap(indexA, indexB);
    };
    state.heap.levels = function() {
      return log2(state.bound);
    };
    state.pathfind = function(from, to, upwards) {
      const openSet = [from];
      const closedSet = new Set();
      closedSet.add(from);
      while (openSet.length > 0) {
        for (const [destId, destHigherPri] of state.comparisons.get(openSet.shift())) {
          if (destHigherPri === upwards) {
            if (destId === to) {
              return true;
            } else if (!closedSet.has(destId)) {
              openSet.push(destId);
              closedSet.add(destId);
            }
          }
        }
      }
      return false;
    };
    state.deduceComparison = function(left, right) {
      // try direct search first
      const leftComparisons =state.comparisons.get(left);
      const comparison = leftComparisons.get(right);
      if (comparison !== undefined) return comparison;

      // then try pathfinding in either direction
      if (state.pathfind(left, right, false)) { // downwards
        leftComparisons.set(right, false);
        state.comparisons.get(right).set(left, true);
        undoStack.peek().comps.push([left, right]);
        return false;
      }
      if (state.pathfind(left, right, true)) { // upwards
        leftComparisons.set(right, true);
        state.comparisons.get(left).set(right, true);
        undoStack.peek().comps.push([left, right]);
        return true;
      }

      // if it didn't work, there's no deduction to be made
      return null;
    };
    state.exec = function(rHigherPri, isRedo) {
      undoStack.push({
        left: selection.left, right: selection.right, next: state.next, bound: state.bound, swaps: [], comps: [],
        statusText, progress, rHigherPri
      });
      if (!isRedo) redoStack.clear();
      ++state.counter;
      state.comparisons.get(selection.left).set(selection.right, rHigherPri);
      state.comparisons.get(selection.right).set(selection.left, !rHigherPri);
      this.next(rHigherPri);
      while (state.next) {
        const deduction = state.deduceComparison(selection.left, selection.right);
        if (deduction === null) break;
        this.next(deduction);
      }
    };
    state.next = enqueue(state);
    wrapper.classList.add('s2');
    setTimeout(() => scrollTo({top: 0}), 2);
  };
  $id('sort-selection-left').onclick = () => state.exec(false, false);
  $id('sort-selection-right').onclick = () => state.exec(true, false);
  controlUndo.onclick = () => {
    if (undoStack.isNotEmpty()) {
      const action = undoStack.pop();
      state.comparisons.get(action.left).delete(action.right);
      state.comparisons.get(action.right).delete(action.left);
      state.next = action.next;
      state.bound = action.bound;
      for (let i = action.swaps.length - 1; i >= 0; i--) {
        state.heap.unswap(...action.swaps[i]);
      }
      for (const [left, right] of action.comps) {
        state.comparisons.get(left).delete(right);
        state.comparisons.get(right).delete(left);
      }
      setStatusStage(action.statusText);
      setStatusBar(action.progress);
      setSelection(action.left, action.right);
      stage2.classList.remove('done');
      redoStack.push(action);
      --state.counter;
    }
  };
  controlRedo.onclick = () => {
    if (redoStack.isNotEmpty()) {
      state.exec(redoStack.pop().rHigherPri, true);
    }
  };
  $id('sort-control-restart').onclick = () => {
    if (confirm('Are you sure you want to restart?')) {
      state = null;
      wrapper.classList.remove('s2');
      stage2.classList.remove('done');
      undoStack.clear();
      redoStack.clear();
    }
  };

  // INITIAL STATE

  function fail(text) {
    document.getElementById('fail-text').innerText = text;
    wrapper.classList.add('fail');
  }
  (async () => {
    if (!document.location.search) {
      fail('Please provide a link to a text file in the URL query string!');
    }
    const url = document.location.search.substring(1);
    if (!url) {
      fail('Please provide a link to a text file in the URL query string!');
    }
    try {
      const baseline = (await (await fetch(url)).text())
          .trim().split('\n').map(s => s.trim()).filter(s => s.length > 0);
      for (const item of baseline) {
        banList.appendChild(generateBanElem(item));
      }
      $id('ban-finish').onclick = init.bind(null, baseline);
    } catch (e) {
      fail(e.message);
    }
  })();

})();
