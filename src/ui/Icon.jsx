import { ICONS, FallbackIcon } from './icons'

const warned = new Set()

/**
 * <Icon name="truck" size={16} />: a Tabler icon as inline SVG.
 * `size` defaults to 1em, so the icon follows the font size of where it sits
 * (CSS such as `.ix-btn > .ix-icon { font-size: 16px }` sizes it).
 * Decorative by default (aria-hidden); pass `title` to give it a name.
 * Names live in src/ui/icons.js.
 */
export function Icon({ name, size = '1em', stroke = 1.75, className = '', style, title, ...rest }) {
  let Comp = ICONS[name]
  if (!Comp) {
    if (import.meta.env.DEV && name && !warned.has(name)) {
      warned.add(name)
      console.warn(`[Icon] "${name}" is not in src/ui/icons.js; add it there (https://tabler.io/icons).`)
    }
    Comp = FallbackIcon
  }
  return (
    <Comp
      size={size}
      stroke={stroke}
      className={`ix-icon ${className}`.trim()}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      focusable="false"
      {...rest}
    />
  )
}

export default Icon
