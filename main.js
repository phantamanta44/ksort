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
    setStatusBar(1 - state.bound / length / 2 + log2(index) / state.heap.levels() / length);
    return rHigherPri => {
      state.next = percolateDown2(state, index, rHigherPri ? lch : rch);
    };
  };

  const percolateDown2 = (state, index, child) => {
    console.log('Transition to percolateDown2');
    setSelection(state.heap.hget(index), state.heap.hget(child));
    const length = state.heap.length + 1;
    setStatusBar(1 - state.bound / length / 2 + (0.5 + log2(index)) / state.heap.levels() / length);
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
    const heap = baseline.filter((item, index) => banList.children[index].children[0].checked);
    if (heap.length < 2) {
      alert('Must be at least two items!');
      return;
    }
    state = {
      heap,
      bound: 1,
      comparisons: new Map()
    };
    let listHead;
    while (listHead = sortList.firstElementChild) {
      listHead.remove();
    }
    for (let i = 0; i < heap.length; i++) {
      state.comparisons.set(heap[i], new Map());
      sortList.appendChild(generateSortElem(i, heap[i]));
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
    state.exec = function(rHigherPri) {
      undoStack.push({
        left: selection.left, right: selection.right, next: state.next, bound: state.bound, swaps: [],
        statusText, progress, rHigherPri
      });
      redoStack.clear();
      this.doExec(rHigherPri);
    };
    state.doExec = function(rHigherPri) {
      state.comparisons.get(selection.left).set(selection.right, rHigherPri);
      state.comparisons.get(selection.right).set(selection.left, !rHigherPri);
      this.next(rHigherPri);
      while (state.next && state.comparisons.get(selection.left).has(selection.right)) {
        this.next(state.comparisons.get(selection.left).get(selection.right));
      }
    };
    state.next = enqueue(state);
    wrapper.classList.add('s2');
  };
  $id('sort-selection-left').onclick = () => state.exec(false);
  $id('sort-selection-right').onclick = () => state.exec(true);
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
      setStatusStage(action.statusText);
      setStatusBar(action.progress);
      setSelection(action.left, action.right);
      stage2.classList.remove('done');
      redoStack.push(action);
    }
  };
  controlRedo.onclick = () => {
    if (redoStack.isNotEmpty()) {
      state.doExec(redoStack.pop().also(action => undoStack.push(action)).rHigherPri);
    }
  };
  $id('sort-control-restart').onclick = () => {
    state = null;
    wrapper.classList.remove('s2');
    stage2.classList.remove('done');
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
          .trim().split('\n').map(s => s.trim()).filter(s => s.length);
      for (const item of baseline) {
        banList.appendChild(generateBanElem(item));
      }
      $id('ban-finish').onclick = init.bind(null, baseline);
    } catch (e) {
      fail(e.message);
    }
  })();

})();
