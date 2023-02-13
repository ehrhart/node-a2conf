import path from 'path'
import { Node, fromFile, fromText } from '../src/index'

const examples = {
  c1: `
  # Test VirtualHost
  <VirtualHost *:80 *:443>
      ServerAdmin postmaster@example.com
      ServerName example.com
      ServerAlias www.example.com example.example.com
      ServerAlias x.example.com
      DocumentRoot /usr/local/apache/htdocs/example.com

      Command1 first
      Command1 second

      <IfModule mod_ssl.c>
          Command1 nested
          SSLEngine on
          SSLCertificateFile /etc/letsencrypt/live/example.com/fullchain.pem
          SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem
          SSLCertificateChainFile /etc/letsencrypt/live/example.com/chain.pem
      </IfModule mod_ssl.c>
  </VirtualHost>
  `,
  include: `Include ${path.join(__dirname, 'test.conf')}`,
  include_glob: `Include ${path.join(__dirname, 't*.conf')}`,
}

test('loadFile', async () => {
  expect(await fromFile(path.join(__dirname, 'test.conf'))).toBeInstanceOf(Node)
})

test('add', () => {
  const root = new Node()
  const cmd = new Node({ raw: 'ServerName example.com' })
  root.add(cmd)
  root.insert('DocumentRoot /var/www/html')
  root.insert('ServerAlias www.example.com', 'DocumentRoot')

  const vhost = root.insert('<VirtualHost *:80>')
  vhost.insert('ServerName example.net')
  vhost.insert('DocumentRoot /var/www/examplenet/')
  vhost.insert('ServerAlias www.example.net', 'servername')

  expect(root).toMatchObject({
    content: [
      {
        raw: 'ServerName example.com',
        content: [],
        prefix: '    ',
        section: null,
        cmd: 'ServerName',
        args: 'example.com',
        suffix: '',
        lastChild: null,
        includes: true,
        name: 'ServerName',
      },
      {
        raw: 'DocumentRoot /var/www/html',
        content: [],
        prefix: '    ',
        section: null,
        cmd: 'DocumentRoot',
        args: '/var/www/html',
        suffix: '',
        lastChild: null,
        includes: true,
        name: 'DocumentRoot',
      },
      {
        raw: 'ServerAlias www.example.com',
        content: [],
        prefix: '    ',
        section: null,
        cmd: 'ServerAlias',
        args: 'www.example.com',
        suffix: '',
        lastChild: null,
        includes: true,
        name: 'ServerAlias',
      },
      {
        raw: '<VirtualHost *:80>',
        content: [
          {
            raw: 'ServerName example.net',
            content: [],
            prefix: '    ',
            section: null,
            cmd: 'ServerName',
            args: 'example.net',
            suffix: '',
            lastChild: null,
            includes: true,
            name: 'ServerName',
          },
          {
            raw: 'ServerAlias www.example.net',
            content: [],
            prefix: '    ',
            section: null,
            cmd: 'ServerAlias',
            args: 'www.example.net',
            suffix: '',
            lastChild: null,
            includes: true,
            name: 'ServerAlias',
          },
          {
            raw: 'DocumentRoot /var/www/examplenet/',
            content: [],
            prefix: '    ',
            section: null,
            cmd: 'DocumentRoot',
            args: '/var/www/examplenet/',
            suffix: '',
            lastChild: null,
            includes: true,
            name: 'DocumentRoot',
          },
        ],
        prefix: '    ',
        section: 'VirtualHost',
        cmd: null,
        args: '*:80',
        suffix: '',
        lastChild: null,
        includes: true,
        name: '<VirtualHost>',
      },
    ],
    prefix: '    ',
    section: null,
    cmd: null,
    args: '',
    suffix: null,
    lastChild: {
      raw: 'ServerName example.com',
      content: [],
      prefix: '    ',
      section: null,
      cmd: 'ServerName',
      args: 'example.com',
      suffix: '',
      lastChild: null,
      includes: true,
      name: 'ServerName',
    },
    includes: true,
    name: '#root',
  })
})

test('children', async () => {
  const root = await fromText(examples['c1'])

  expect(Array.from(root.children('<VirtualHost>'))).toHaveLength(1)

  const vh = Array.from(root.children('<VirtualHost>'))[0]
  expect(Array.from(vh.children('ServerAlias'))).toHaveLength(2)
  expect(Array.from(vh.children('serveralias'))).toHaveLength(2)
  expect(Array.from(vh.children('SERVERALIAS'))).toHaveLength(2)

  const aliases: string[] = []
  for (const aliasNode of vh.children('ServerAlias')) {
    for (const alias of aliasNode.args.split(' ')) {
      aliases.push(alias)
    }
  }
  expect(aliases).toHaveLength(3)

  // should not be found because not recursive
  expect(
    Array.from(vh.children('sslengine', { recursive: false }))
  ).toHaveLength(0)

  // should be found because not recursive
  expect(
    Array.from(vh.children('sslengine', { recursive: true }))
  ).toHaveLength(1)
})

test('include', async () => {
  // with disabled recursion len = 1
  const root = await fromText(examples['include'], { includes: false })

  expect(
    Array.from(root.children(undefined, { recursive: true }))
  ).toHaveLength(1)

  const rootWithIncludes = await fromText(examples['include'], {
    includes: true,
  })
  expect(
    Array.from(rootWithIncludes.children(undefined, { recursive: true })).length
  ).toBeGreaterThan(1)
})

test('include_glob', async () => {
  // with disabled recursion len = 1
  const root = await fromText(examples['include_glob'])

  expect(
    Array.from(root.children(undefined, { recursive: true })).length
  ).toBeGreaterThan(1)
})

test('replace', async () => {
  const root = await fromText(examples['c1'])

  const ssl = root.children('SSLEngine', { recursive: true })[0]
  ssl.args = 'off'

  const ssl2 = root.children('SSLEngine', { recursive: true })[0]
  expect(ssl2.args).toEqual('off')
})

test('first', async () => {
  const root = await fromText(examples['c1'])

  const name1 = root.children('servername', { recursive: true })[0]
  const name2 = root.children('servername', { recursive: true })[0]
  const name3 = root.first('servername', { recursive: true })
  expect(name1).toEqual(name2)
  expect(name2).toEqual(name3)
})

test('delete', async () => {
  const root = await fromText(examples['c1'])

  const ssl = root.first('SSLEngine', { recursive: true })
  ssl?.delete()
  expect(root.first('SSLEngine', { recursive: true })).toBeUndefined()
})

test('find_vhost', async () => {
  const root = await fromText(examples['c1'])

  root.findVHost('example.com', '*:80')
  root.findVHost('www.example.com', '*:443')
  root.findVHost('example.example.com')
  root.findVHost('x.example.com')
})

test('missing_vhost', async () => {
  const root = new Node()

  expect(root.findVHost('missing.example.com')).toBeNull()
  expect(root.findVHost('example.com', '*:8888')).toBeNull()
})

test('set', async () => {
  const root = await fromText(`<VirtualHost *:80>
  ServerAdmin postmaster@example.com
  ServerName example.com
  ServerAlias www.example.com example.example.com
  ServerAlias x.example.com
  DocumentRoot /usr/local/apache/htdocs/example.com
  SSLEngine On
</VirtualHost>`)

  root.findVHost('example.com')?.set('SSLEngine', 'Off')

  expect(root.findVHost('example.com')?.first('SSLEngine')?.args).toEqual('Off')
})
