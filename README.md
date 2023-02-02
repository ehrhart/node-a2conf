# node-a2conf

node-a2conf is a JavaScript module which provides an easy way to configure apache2.

[![npm package](https://img.shields.io/badge/npm%20i-node--a2conf-brightgreen)](https://www.npmjs.com/package/node-a2conf) [![version number](https://img.shields.io/npm/v/node-a2conf?color=green&label=version)](https://github.com/ehrhart/node-a2conf/releases) [![License](https://img.shields.io/github/license/ehrhart/node-a2conf)](https://github.com/ehrhart/node-a2conf/blob/main/LICENSE)

## Development

### Install dependencies

Install dependencies with npm:

```bash
npm i
```

### Test

Test the code with Jest framework:

```bash
npm run test
```

**Note:** This package uses [husky](https://typicode.github.io/husky/), [pinst](https://github.com/typicode/pinst) and [commitlint](https://commitlint.js.org/) to automatically execute test and [lint commit message](https://www.conventionalcommits.org/) before every commit.

### Build

Build production (distribution) files in the **dist** folder:

```bash
npm run build
```

It generates CommonJS (in **dist/cjs** folder), ES Modules (in **dist/esm** folder), as well as TypeScript declaration files (in **dist/types** folder).

## Examples

### Read and parse from a configuration file

```js
const { fromFile } = require('node-a2conf');

const root = await fromFile('example.conf');

for (const vhost of root.children('VirtualHost')) {
  console.log(vhost.first('ServerName'));
}
```

### Read and parse from a text string

```js
const { fromText } = require('node-a2conf');

const root = await fromText(`<VirtualHost *:80>
  ServerAdmin postmaster@example.com
  ServerName example.com
  ServerAlias www.example.com example.example.com
  ServerAlias x.example.com
  DocumentRoot /usr/local/apache/htdocs/example.com
  SSLEngine On
</VirtualHost>`);

root.findVHost('example.com')?.set('SSLEngine', 'Off')

console.log(root.dump());
```

### Create a new configuration

```js
const { Node } = require('node-a2conf');

const root = new Node();
const vhost = root.insert('<VirtualHost *:80>');
vhost.insert('ServerName example.net');
vhost.insert('DocumentRoot /var/www/examplenet/');
vhost.insert('ServerAlias www.example.net', 'servername');

console.log(root.dump());
/*
<VirtualHost *:80>
    ServerName example.net
    ServerAlias www.example.net
    DocumentRoot /var/www/examplenet/
</VirtualHost>
*/
```

### API

#### `Node`

##### `isOpen()`

Returns true if this node opens section, e.g `<VirtualHost>` or `<IfModule>`.

##### `isClose()`

Returns true if this node closes section.

##### `add(child: Node)`

Append child to node.

##### `addRaw(raw: string)`

Append string as child to node.

##### `insert(childNode: Node | string, afterNode?: Node | string)`

Insert child after another node.

##### `set(name: string, value: string)`

Set the value of a property given its name. If multiple properties with the same name are in the node, they will all be replaced.

##### `getOpenTag()`

Returns the open tag, e.g `<VirtualHost>`.

##### `getCloseTag()`

Returns the open tag, e.g `</VirtualHost>`.

##### `filter(pattern: RegExp | string)`

Returns children matching a pattern.

##### `children(name?: string, { recursive } = { recursive: false })`

Returns children matching name. Set `recursive` to true to search for nested nodes as well.

##### `first(name: string, { recursive } = { recursive: false })`

Returns the first child matching a name. Set `recursive` to true to search for nested nodes as well.

##### `extend(n: Node)`

Extends a node with another node.

##### `readText(text: string)`

Parses raw text and replace all content from that node with the newly parsed content.

##### `readFile(fileName: string)`

Parses a file and replace all content from that node with the newly parsed content.

##### `writeFile(fileName: string)`

Dumps the content of a node as a string into a file.

##### `dump(depth = 0)`

Dumps the content of a node as a string. Set `depth` to the base number of spaces to append on each line.

##### `toString()`

Returns the node name as a string.

##### `delete()`

Deletes the node from its parent.

##### `findVHost(hostname: string, arg?: string)`

Helper function to find a VHost given its name and optional arguments. Returns a `Node` or `null` if no VHost matches the parameters.

#### `fromText(text: string, props?: NodeProps)`

Reads and parses a file then returns a `Node` object.

#### `fromFile(fileName: string, props?: NodeProps)`

Parses a raw text string then returns a `Node` object.

## References

- https://github.com/yaroslaff/a2conf/
