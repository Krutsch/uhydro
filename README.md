# µhydro

![glasses](./uhydro.jpg)

<sup>_Photo by [OpticalNomad](https://unsplash.com/@opticalnomad) on [Unsplash](https://unsplash.com/)_</sup>

> _micro hydro_ is a _~1.3K_ [hydro-js](https://github.com/Krutsch/hydro-js) <strong>minimalistic</strong> "subset" to build declarative and reactive UIs.

## Concept

Proxys for reactive Behaviour and WeakMaps for dependencies. [HTM](https://github.com/developit/htm) could be used for pure Web usage.

## Documentation

### h

args: `JSX args`<br>
returns: `HTMLElement | DocumentFragment`

Receives an JSX object and transforms it to HTML. Used for internal bookkeeping too.

### reactive

args: `any`<br>
returns: unique `Proxy`

This can be used in the JSX. As the name suggests, changes will be applied automatically to the DOM. In order to change the value, the returned Proxy has to be called.

#### Example

```js
const id = reactive(1);
id(20); // Change the value
```

### render

args:

- elem: `Element`<br>
- where?: `Element`<br>

returns: void

A very simple render function. No diffing or patching happens here. Just platform replace or insert.

### observe

args:

- proxy: `ReturnType<typeof reactive>`<br>
- fn: `(newVal, oldVal) => {}`

Calls the function whenever the value of reactive Proxy changes. This is only one layer deep.

### view

Render the elements whenever the data changes. It will handle the operation for deletion, addition, swapping etc. This defaults to a keyed solution.

args:

- root: `string` (CSS selector)<br>
- data: `ReturnType<typeof reactive>`<br>
- renderFunction: `(item: any, i: number) => { // return elem; }`<br>

#### Example

```js
const data = reactive([{ id: 4, label: "Red Onions" }])
view('.table', data, (item, i) => <tr>Reactive: {data[i].id}, Non-reactive: {item.id}<tr>)
```

### getValue

args: `ReturnType<typeof reactive>`<br>
returns: currently set value

Returns the value inside of the Proxy.

#### Example

```js
const person = reactive({ name: "Steve" });
console.log(getValue(person));
```
