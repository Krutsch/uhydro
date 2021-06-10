const $value = Symbol("value");
const $name = Symbol("name");
const reactiveMap = new WeakMap();
const nodeChangeMap = new WeakMap();
const observerMap = new Map();
const registerStack = [];
const globalObj = reactive({});
function h(tag, attrs, ...children) {
    if (typeof tag === "function" /* function */)
        return tag({ ...attrs, children });
    else if (isObject(tag)) {
        return h("", void 0, tag.children);
    }
    const element = tag === ""
        ? document.createDocumentFragment()
        : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (key in element) {
            //@ts-expect-error
            element[key] = value;
        }
        else {
            element.setAttribute(key, String(value));
        }
    }
    element.append(...children.flat(Infinity));
    // Register possible Update
    const [proxy, prop, value] = registerStack.pop() || [];
    if (proxy) {
        const childrenAsString = children.flatMap(idString);
        try {
            if (childrenAsString.includes(value) ||
                (!childrenAsString.includes(value) && isDocumentFragment(element)
                    ? element.textContent.includes(value)
                    : element.outerHTML.includes(value))) {
                const elem = isDocumentFragment(element)
                    ? element.firstChild
                    : element;
                if (reactiveMap.has(proxy)) {
                    // This should be enough – no need to modify reactiveMapReverse?
                    reactiveMap.get(proxy).push(elem);
                }
                else {
                    const elemArr = [elem];
                    reactiveMap.set(proxy, elemArr);
                }
                nodeChangeMap.set(elem, [prop, value]);
            }
        }
        catch {
            return element;
        }
    }
    return element;
}
function render(elem, where) {
    if (where) {
        where.replaceWith(elem);
    }
    else {
        document.body.insertBefore(elem, null);
    }
}
let internSet = false;
function reactive(val) {
    Reflect.set(setter, $value, val);
    let proxy = new Proxy(setter, {
        set(target, key, val, receiver) {
            const oldVal = Reflect.get(target, key, receiver);
            if (oldVal === val)
                return true;
            const isSet = Reflect.set(target, key, val, receiver);
            if (oldVal != null && isSet && !internSet) {
                schedule(updateDOM, val, receiver);
            }
            if (observerMap.has(receiver)) {
                observerMap
                    .get(receiver)
                    .forEach(informObservers.bind(informObservers, val, oldVal));
            }
            return isSet;
        },
        get(target, prop, receiver) {
            const base = Reflect.get(target, $value);
            const isBaseObject = isObject(base);
            let value;
            if (isBaseObject) {
                value = Reflect.get(base, prop, receiver) || base;
            }
            const binding = [
                receiver,
                prop,
                isBaseObject ? value : base,
            ];
            registerStack.push(binding);
            queueMicrotask(deleteFromStack.bind(deleteFromStack, binding));
            return isBaseObject ? value : identity.bind(identity, base);
        },
    });
    // Register on global obj
    const proxyName = randomText();
    Reflect.set(proxy, $name, proxyName);
    if (globalObj && !Reflect.has(globalObj, proxyName)) {
        internSet = true;
        Reflect.set(globalObj, proxyName, proxy);
        internSet = false;
    }
    return proxy;
    function setter(newVal) {
        if (proxy === null)
            return;
        if (newVal === null) {
            Reflect.deleteProperty(proxy, $value);
            //Garbage Collection
            let nodes;
            if (observerMap.has(proxy))
                observerMap.delete(proxy);
            if (reactiveMap.has(proxy)) {
                nodes = reactiveMap.get(proxy);
                reactiveMap.delete(proxy);
            }
            for (let i = 0; nodes && i < nodes.length; i++) {
                const node = nodes[i];
                if (nodeChangeMap.has(node))
                    nodeChangeMap.delete(node);
            }
            proxy = newVal;
            return;
        }
        else if (typeof newVal === "function" /* function */) {
            setter(newVal(Reflect.get(proxy, $value)));
            return;
        }
        Reflect.set(proxy, $value, newVal);
    }
}
function observe(proxy, fn) {
    if (observerMap.has(proxy)) {
        observerMap.get(proxy).push(fn);
    }
    else {
        observerMap.set(proxy, [fn]);
    }
}
function informObservers(newVal, oldVal, fn) {
    fn(newVal, oldVal);
}
function view(root, data, renderFunction) {
    const rootElem = document.body.querySelector(root);
    const elements = Reflect.get(data, $value).map(renderFunction);
    rootElem.append(...elements);
    observe(data, renderView.bind(renderView, rootElem, renderFunction));
}
function renderView(rootElem, renderFunction, newData, oldData) {
    // Clear
    const sameSize = new Set([...oldData, ...newData]).size ===
        oldData?.length + newData?.length;
    if (!newData?.length || oldData?.length === newData?.length || sameSize) {
        rootElem.textContent = "";
        for (let index = 0; index < oldData.length; index++) {
            oldData[index](null);
        }
    }
    // Add to existing
    if (oldData?.length && newData?.length > oldData?.length) {
        const length = oldData.length;
        const slicedData = sameSize ? newData : newData.slice(length);
        const newElements = slicedData.map(newElementsFn.bind(newElementsFn, renderFunction, length));
        rootElem.append(...newElements);
    }
    // Remove and add
    else if (newData?.length && newData?.length < oldData.length) {
        oldData
            .reverse()
            .forEach(removeChild.bind(removeChild, rootElem, newData, oldData.length - 1));
        newData.forEach(addNewOnes.bind(addNewOnes, rootElem, renderFunction, oldData));
    }
    // Add new elements
    else if (oldData?.length === 0 || oldData?.length === newData?.length) {
        const elements = newData.map(renderFunction);
        rootElem.append(...elements);
    }
}
function newElementsFn(renderFunction, length, item, i) {
    return renderFunction(item, i + length);
}
function addNewOnes(rootElem, renderFunction, oldData, item, i) {
    if (!oldData.includes(item)) {
        rootElem.appendChild(renderFunction(item, i));
    }
}
function removeChild(rootElem, newData, length, item, i) {
    if (!newData.includes(item)) {
        item(null);
        rootElem.childNodes[length - i]?.remove();
    }
}
function updateDOM(value, receiver) {
    if (reactiveMap.has(receiver)) {
        const nodes = reactiveMap.get(receiver);
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const [prop, oldVal] = nodeChangeMap.get(node);
            const nextVal = isObject(value) ? Reflect.get(value, prop) : value;
            // Check attributes and textContent
            let modified = false;
            if (!isTextNode(node) && node.outerHTML.includes(oldVal)) {
                modified = node
                    .getAttributeNames()
                    .some(replaceAttribute.bind(replaceAttribute, node, oldVal, nextVal));
            }
            if (!modified) {
                node.textContent = node.textContent.replace(oldVal, nextVal);
            }
            nodeChangeMap.set(node, [prop, nextVal]);
        }
    }
}
function replaceAttribute(element, oldVal, nextVal, attr) {
    const attrValue = element.getAttribute(attr);
    if (attrValue === oldVal) {
        element.setAttribute(attr, nextVal);
        return true;
    }
}
function schedule(fn, ...args) {
    //@ts-expect-error
    if (navigator.scheduling) {
        //@ts-expect-error
        if (navigator.scheduling.isInputPending()) {
            setTimeout(schedule, 0, fn, ...args);
        }
        else {
            fn(...args);
        }
    }
    else {
        //@ts-expect-error
        (requestIdleCallback || setTimeout)(fn.bind(fn, ...args));
    }
}
function getValue(proxy) {
    return Reflect.get(proxy, $value);
}
function swap(d1, d2) {
    const rMap1 = reactiveMap.get(d1);
    const rMap2 = reactiveMap.get(d2);
    for (let index = 0; index < rMap1.length; index++) {
        const elem1 = rMap1[index];
        const elem2 = rMap2[index];
        const elem2Next = elem2.nextSibling;
        const elem2Prev = elem2.previousSibling;
        const elem2Parent = elem2.parentNode;
        elem1.before(elem2);
        if (elem2Next) {
            elem2Next.before(elem1);
        }
        else if (elem2Prev) {
            elem2Prev.after(elem1);
        }
        else {
            elem2Parent.appendChild(elem1);
        }
    }
}
// Utility
function identity(something) {
    return something;
}
function idString(something) {
    return String(something);
}
function equals(a, b) {
    return a === b;
}
function randomText() {
    return Math.random().toString(32).slice(2);
}
function isObject(obj) {
    return obj != null && typeof obj === "object";
}
function deleteFromStack(binding) {
    const idx = registerStack.findIndex(equals.bind(equals, binding));
    registerStack.splice(idx, 1);
}
function isTextNode(node) {
    return node.splitText !== undefined;
}
function isDocumentFragment(node) {
    return node.nodeName !== "svg" && "getElementById" in node;
}
export { h, reactive, render, observe, view, getValue, swap };
