// Spike: token discipline over Tailwind class strings.
// Scans string/template literals inside className/class JSX attributes and
// inside cn()/cva()/clsx()/twMerge()/tv() calls (including cva variant objects).
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW_COLOR = new RegExp(
  `^(bg|text|border(-[trblxy])?|ring|ring-offset|fill|stroke|outline|divide|from|via|to|decoration|placeholder|caret|accent|shadow)-((${PALETTE})-(50|[1-9]00|950)|black|white)(/\\d+)?$`,
)
const HEXISH = /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(/
const CALLEES = new Set(['cn', 'cva', 'clsx', 'twMerge', 'tv', 'classnames'])
const KIT_SOURCES = [/^@\/components\/ui(\/|$)/, /^@\/components\/base(\/|$)/]
// padding / font-size / colour / radius on a kit component
const RESTYLE =
  /^(p[trblxyse]?-|text-(xs|sm|base|lg|[0-9]?xl|title|heading|name|body|control|meta|caption)|text-(ink|accent|primary|muted|destructive|status|chip|foreground)|bg-|border-(ink|accent|status|chip|border|subtle|strong)|rounded)/

// split "a:b:[x:y]:util" on top-level colons; the utility is the last segment
function utilityOf(cls) {
  let depth = 0
  let last = 0
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ':' && depth === 0) last = i + 1
  }
  return cls.slice(last).replace(/^!/, '').replace(/!$/, '')
}

function classesIn(node) {
  if (node.type === 'Literal' && typeof node.value === 'string')
    return node.value.split(/\s+/).filter(Boolean)
  if (node.type === 'TemplateLiteral')
    return node.quasis.flatMap((q) => q.value.raw.split(/\s+/).filter(Boolean))
  return []
}

// collect string-bearing nodes under an expression (conditionals, arrays, objects)
function collect(node, out) {
  if (!node) return
  switch (node.type) {
    case 'Literal':
    case 'TemplateLiteral':
      out.push(node)
      if (node.type === 'TemplateLiteral') node.expressions.forEach((e) => collect(e, out))
      break
    case 'ConditionalExpression':
      collect(node.consequent, out)
      collect(node.alternate, out)
      break
    case 'LogicalExpression':
      collect(node.right, out)
      collect(node.left, out)
      break
    case 'ArrayExpression':
      node.elements.forEach((e) => collect(e, out))
      break
    case 'ObjectExpression':
      node.properties.forEach((p) => p.type === 'Property' && collect(p.value, out))
      break
    case 'CallExpression':
      if (node.callee.type === 'Identifier' && CALLEES.has(node.callee.name))
        node.arguments.forEach((a) => collect(a, out))
      break
    case 'JSXExpressionContainer':
      collect(node.expression, out)
      break
  }
}

function check(context, strNode, kitName) {
  for (const cls of classesIn(strNode)) {
    const u = utilityOf(cls)
    if (RAW_COLOR.test(u) || (u.includes('[') && HEXISH.test(u) && !/var\(--/.test(u)))
      context.report({ node: strNode, messageId: 'rawColor', data: { cls } })
    else if (/\[/.test(u)) {
      const inner = u.slice(u.indexOf('[') + 1, u.lastIndexOf(']'))
      const tokenOnly = /^var\(--[\w-]+\)$/.test(inner)
      if (!tokenOnly)
        context.report({
          node: strNode,
          messageId: /var\(--/.test(inner) ? 'arbitraryTokenCalc' : 'arbitrary',
          data: { cls },
        })
    }
    if (kitName && RESTYLE.test(u))
      context.report({ node: strNode, messageId: 'restyle', data: { cls, kit: kitName } })
  }
}

export default {
  meta: {
    type: 'suggestion',
    messages: {
      rawColor: 'raw colour "{{cls}}" — use a semantic colour token',
      arbitrary: 'arbitrary value "{{cls}}" — use a scale step or token',
      arbitraryTokenCalc: 'token-composed arbitrary value "{{cls}}"',
      restyle: 'restyle of kit component <{{kit}}> via "{{cls}}" — add a variant instead',
    },
    schema: [],
  },
  create(context) {
    const kit = new Set()
    const seen = new Set()
    const run = (expr, kitName) => {
      const out = []
      collect(expr, out)
      for (const n of out) {
        const key = `${n.range[0]}:${kitName ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        check(context, n, kitName)
      }
    }
    return {
      ImportDeclaration(node) {
        if (KIT_SOURCES.some((r) => r.test(node.source.value)))
          node.specifiers.forEach((s) => kit.add(s.local.name))
      },
      JSXAttribute(node) {
        if (node.name.name !== 'className' && node.name.name !== 'class') return
        const el = node.parent.name
        const name = el.type === 'JSXIdentifier' ? el.name : el.type === 'JSXMemberExpression' ? el.object.name : null
        run(node.value, name && kit.has(name) ? name : null)
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || !CALLEES.has(node.callee.name)) return
        if (node.parent.type === 'JSXExpressionContainer') return // handled via JSXAttribute
        run(node, null)
      },
    }
  },
}
