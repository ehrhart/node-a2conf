import { createReadStream, promises as fs, lstatSync, existsSync } from 'fs'
import path from 'path'
import readline from 'readline'

import glob from 'glob'

const id = (() => {
  let currentId = 0
  const map = new WeakMap()

  return (object: object) => {
    if (!map.has(object)) {
      map.set(object, currentId)
      currentId += 1
    }

    return map.get(object)
  }
})()

type NodeProps = {
  raw?: string
  parent?: Node
  name?: string
  path?: string
  line?: number
  includes?: boolean
}

export class Node {
  raw?: string
  parent?: Node
  name: string
  path: string | undefined
  line: number | undefined
  includes: boolean
  content: Node[]
  prefix: string
  section: string | null
  cmd: string | null
  args: string
  suffix: string | null
  lastChild: Node | null

  constructor({
    raw,
    parent,
    name,
    path,
    line,
    includes = true,
  }: NodeProps = {}) {
    this.raw = raw
    this.parent = parent
    this.content = [] // children
    this.prefix = ' '.repeat(4)
    this.section = null // Section e.g. "VirtualHost" or null
    this.cmd = null // Command, e.g. "ServerName" or null
    this.args = ''
    this.suffix = null
    this.lastChild = null
    this.includes = includes

    this.path = path // Filename
    this.line = line // line in file

    if (this.raw) {
      const match = this.raw.match(/(#.*)$/)
      if (match) {
        this.suffix = match[0]
      } else {
        this.suffix = ''
      }
    }

    if (name) {
      this.name = name
    } else if (this.raw) {
      // guess name, ServerName or <VirtualHost>
      this.name = this.raw.trim().split(' ')[0]
      if (this.name.startsWith('<') && !this.name.endsWith('>')) {
        this.name += '>'
      }
    } else {
      this.name = '#root'
    }

    if (this.raw) {
      if (this.isOpen()) {
        const m = this.raw.match(/[ \t]*<([^ >]+)([^>]*)/)
        if (m) {
          this.section = m[1]
          this.args = m[2].trim()
        }
      } else if (this.isClose()) {
        const m = this.raw.match(/[ \t]*<(\/[^ >]+)([^>]*)/)
        if (m) {
          this.section = m[1]
        }
      } else {
        const cmdline = this.raw.split('#')[0].trim()

        if (cmdline) {
          const m = cmdline.match(/[ \t]*([^ \t]+)[ \t]*([^#]*)/)
          if (!m) {
            throw new Error(`Cannot parse: ${cmdline}`)
          } else {
            // parsed well
            this.cmd = m[1]
            this.args = m[2].trim()
          }
        }
      }
    }
  }

  isOpen() {
    // Return true if this node opens section, e.g <VirtualHost> or <IfModule>
    if (!this.raw) {
      return false
    }

    return this.raw.match(/^[ \t]*<(?!\/)/)
  }

  isClose() {
    // Return true if this node closes section
    if (!this.raw) {
      return false
    }

    return this.raw.match(/[ \t]*<\//)
  }

  add(child: Node) {
    // Append child to node
    if (!(child instanceof Node)) {
      throw new Error('Child must be an instance of Node')
    }

    if (!this.content) {
      this.content = []
    }

    this.content.push(child)
    this.lastChild = child
  }

  addRaw(raw: string) {
    const sl = new Node({ raw, parent: this })
    this.add(sl)
  }

  insert(childNode: Node | string, afterNode?: Node | string) {
    function getIndex(content: Node[], after: Node | string) {
      // return index of
      let idx = -1
      content.forEach((c, i) => {
        if (after instanceof Node && id(c) === id(after)) {
          idx = i + 1
        } else if (
          typeof after === 'string' &&
          c.name.toLowerCase() === after.toLowerCase()
        ) {
          idx = i + 1
        }
      })
      return idx
    }

    const after: (string | Node)[] = []
    const child: (Node | string)[] = []

    // sanity checks
    // 1: after must be list of str or nodes
    if (typeof afterNode === 'string' || afterNode instanceof Node) {
      after.push(afterNode)
    }

    // 2: child is list of nodes/str
    if (typeof childNode === 'string' || childNode instanceof Node) {
      child.push(childNode)
    }

    const childNodes = child.map((x) =>
      typeof x === 'string' ? new Node({ raw: x }) : x
    )

    if (!this.content) {
      this.content = childNodes
      return childNodes[0]
    }

    if (after) {
      for (const afterItem of after.reverse()) {
        const idx = getIndex(this.content, afterItem)
        if (idx > -1) {
          this.content.splice(idx, 0, ...childNodes)
          return childNodes[0]
        }
      }
    }

    this.content.push(...childNodes)
    return childNodes[0]
  }

  set(name: string, value: string) {
    const properties = this.children(name)
    if (properties.length === 0) {
      this.insert(`${name} ${value}`)
    } else {
      for (const property of properties) {
        property.args = value
      }
    }
  }

  getOpenTag() {
    return `<${this.section} ${this.args}>`
  }

  getCloseTag() {
    return `</${this.section}>`
  }

  filter(pattern: RegExp | string) {
    function ff(regex: RegExp | string, c: Node) {
      if (c.section) {
        c.filter(regex)
      }
      return !c.raw?.match(new RegExp(regex, 'i'))
    }

    this.content = this.content.filter((c) => ff(pattern, c))
  }

  children(name?: string, { recursive } = { recursive: false }): Node[] {
    const nodes = []
    if (this.content) {
      for (const c of this.content) {
        if (name) {
          // filter by cmd/section
          if (c.name.toLowerCase() === name.toLowerCase()) {
            nodes.push(c)
          }
        } else {
          nodes.push(c)
        }

        if (recursive && c.content) {
          for (const subc of c.children(name, { recursive })) {
            nodes.push(subc)
          }
        }
      }
    }
    return nodes
  }

  first(name: string, { recursive } = { recursive: false }): Node | undefined {
    /**
     * Wrapper for children to get only first element or None
     * :param name: name of element, e.g. ServerName or SSLEngine
     * :param recursive:
     * :return: Node or undefined
     */
    return this.children(name, { recursive })[0]
  }

  extend(n: Node) {
    this.content.push(...n.content)
  }

  async readText(text: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let parent: Node | undefined = this
    let lineIndex = 0
    for (const line of text.split('\n')) {
      lineIndex += 1
      const l = line.trim()
      if (!l) {
        continue
      }

      const node: Node = new Node({
        raw: l,
        parent,
        line: lineIndex,
      })

      if (node.isOpen()) {
        parent?.add(node)
        parent = node
      } else if (node.isClose()) {
        // do not add closing tags
        parent = parent?.parent
      } else {
        parent?.add(node)
      }

      if (
        this.includes &&
        ['include', 'includeoptional'].includes(node.name.toLowerCase())
      ) {
        let fullpath = path.join(node.args)
        if (existsSync(fullpath) && lstatSync(fullpath).isDirectory()) {
          fullpath = path.join(fullpath, '*')
        }

        const matches = glob.sync(path.join(fullpath))
        for (const path of matches) {
          try {
            const subNode = new Node({ path })
            await subNode.readFile(path)
            this.extend(subNode)
          } catch (err) {
            console.warn(`WARN failed to import ${path} (${l})`)
          }
        }
      }
    }
  }

  async readFile(filename: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let parent: Node | undefined = this
    this.path = filename

    let lineIndex = 0

    const fileStream = createReadStream(filename)
    const rl = readline.createInterface({ input: fileStream })
    for await (const line of rl) {
      lineIndex += 1
      const l = line.trim()
      if (!l) {
        continue
      }

      const node: Node = new Node({
        raw: l,
        parent,
        path: filename,
        line: lineIndex,
      })

      if (node.isOpen()) {
        parent?.add(node)
        parent = node
      } else if (node.isClose()) {
        // do not add closing tags
        parent = parent?.parent
      } else {
        parent?.add(node)
      }

      if (
        this.includes &&
        ['include', 'includeoptional'].includes(node.name.toLowerCase())
      ) {
        const basedir = path.dirname(filename)
        let fullpath = path.join(basedir, node.args)
        if (lstatSync(fullpath).isDirectory()) {
          fullpath = path.join(fullpath, '*')
        }

        const matches = glob.sync(path.join(fullpath))
        for (const path of matches) {
          try {
            const subNode = new Node({ path })
            await subNode.readFile(path)
            this.extend(subNode)
          } catch (err) {
            console.warn(`WARN failed to import ${path} (${l})`)
          }
        }
      }
    }
  }

  async writeFile(fileName: string) {
    return fs.writeFile(fileName, this.dump())
  }

  vdump(depth = 0) {
    const newdepth = depth + 1
    if (this.content) {
      for (const d of this.content) {
        if (d.isOpen()) {
          console.log(this.prefix.repeat(depth) + d.getOpenTag())
          d.vdump(newdepth)
          console.log(this.prefix.repeat(depth) + d.getCloseTag())
        } else {
          console.log(this.prefix.repeat(depth) + d.toString())
        }
      }
    }
  }

  dump(depth = 0) {
    const output: string[] = []
    const paddedSuffix = this.suffix ? ` ${this.suffix}` : ''
    if (this.cmd) {
      output.push(
        `${this.prefix.repeat(depth)}${this.cmd} ${this.args}${paddedSuffix}\n`
      )
    } else if (this.section) {
      // last section element should have depth-1
      const lineDepth = this.section.startsWith('/') ? depth - 1 : depth

      if (this.args) {
        output.push(
          `${this.prefix.repeat(lineDepth)}<${this.section} ${
            this.args
          }>${paddedSuffix}\n`
        )
      } else {
        output.push(
          `${this.prefix.repeat(lineDepth)}<${this.section}>${paddedSuffix}\n`
        )
      }

      if (this.children.length > 0) {
        for (const d of this.content) {
          output.push(...d.dump(depth + 1))
        }
        output.push(`${this.prefix.repeat(lineDepth)}</${this.section}>\n`)
      }
    } else {
      // neither cmd, nor section
      if (this.suffix) {
        output.push(`${this.prefix.repeat(depth) + this.suffix}\n`)
      } else if (this.raw) {
        output.push('\n')
      }

      // only root node has cmd=None, section=None but has children
      if (this.children.length > 0) {
        for (const d of this.content) {
          output.push(...d.dump(depth))
        }
      }
    }

    return output.join('')
  }

  toString() {
    return this.name || this.raw
  }

  delete() {
    // Delete myself from parent content
    if (this.parent) {
      this.parent.content = this.parent.content.filter((node) => {
        return id(node) !== id(this)
      })
    }
  }

  findVHost(hostname: string, arg?: string) {
    function getAllHostnames(vhost: Node) {
      const names = []
      const servername = vhost.first('ServerName')?.args
      names.push(servername)
      for (const alias of vhost.children('ServerAlias')) {
        names.push(...alias.args.split(' '))
      }
      return names
    }

    for (const vhost of this.children('<VirtualHost>')) {
      if (arg && !vhost.args.includes(arg)) {
        continue
      }
      if (getAllHostnames(vhost).includes(hostname)) {
        return vhost
      }
    }

    return null
  }
}

export const fromFile = async (fileName: string, props?: NodeProps) => {
  const node = new Node(props)
  await node.readFile(fileName)
  return node
}

export const fromText = async (text: string, props?: NodeProps) => {
  const node = new Node(props)
  await node.readText(text)
  return node
}
