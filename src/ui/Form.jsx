import { Children, cloneElement, isValidElement, useId, useRef } from 'react'
import { Icon } from './Icon'
import { cx } from './utils'

/**
 * <Field label="BE number" hint="7 digits" error={err} required>
 *   <Input value={be} onChange={…} />
 * </Field>
 * Wires the label, hint and error to the single control inside (id,
 * aria-describedby, aria-invalid). Pass `id` to choose the control's id.
 */
export function Field({ label, hint, error, required, id, className, children }) {
  const auto = useId()
  const child = Children.only(children)
  const controlId = id || (isValidElement(child) && child.props.id) || `f${auto}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errId = error ? `${controlId}-err` : undefined
  const describedBy = [child.props?.['aria-describedby'], hintId, errId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(child)
    ? cloneElement(child, { id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : child.props['aria-invalid'], required: child.props.required ?? required })
    : child
  return (
    <div className={cx('ix-field', className)}>
      {label && <label className="ix-label" htmlFor={controlId}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>}
      {control}
      {hint && !error && <div className="ix-hint" id={hintId}>{hint}</div>}
      {error && <div className="ix-field-error" id={errId} role="alert"><Icon name="alert-circle" />{error}</div>}
    </div>
  )
}

const SIZE = { sm: 'sm', md: '', lg: 'lg' }

/** <Input size="sm|md|lg" mono invalid … />: all native input props pass through. */
export function Input({ size = 'md', mono = false, invalid, className, ref, ...rest }) {
  return <input ref={ref} className={cx('ix-input', SIZE[size], mono && 'mono', className)} aria-invalid={invalid || rest['aria-invalid'] || undefined} {...rest} />
}

/** <Textarea rows={4} … /> */
export function Textarea({ invalid, className, ref, rows = 3, ...rest }) {
  return <textarea ref={ref} rows={rows} className={cx('ix-textarea', className)} aria-invalid={invalid || rest['aria-invalid'] || undefined} {...rest} />
}

/**
 * Native <select>, styled. Either children (<option>s) or
 * options={[{ value, label }] | ['a', 'b']}. `block` makes it full width.
 */
export function Select({ size = 'md', options, invalid, block = false, className, children, ref, ...rest }) {
  return (
    <span className={cx('ix-select-wrap', block && 'block')}>
      <select ref={ref} className={cx('ix-select', SIZE[size], className)} aria-invalid={invalid || rest['aria-invalid'] || undefined} {...rest}>
        {options ? options.map((o) => {
          const opt = typeof o === 'object' ? o : { value: o, label: o }
          return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        }) : children}
      </select>
      <Icon name="selector" />
    </span>
  )
}

/**
 * <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" />
 * Leading search icon, clear button (calls onClear, else onValueChange(''),
 * else onChange with an empty value) and an optional `hint` key (e.g. "/").
 * `onValueChange(v)` is a shortcut for the string value.
 */
export function SearchInput({ value, onChange, onValueChange, onClear, hint, size = 'md', className, placeholder = 'Search', label, ref, ...rest }) {
  const inner = useRef(null)
  const setRef = (el) => {
    inner.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  const clear = () => {
    if (onClear) onClear()
    else if (onValueChange) onValueChange('')
    else onChange?.({ target: { value: '' }, currentTarget: { value: '' } })
    inner.current?.focus()
  }
  return (
    <div className={cx('ix-search-input', className)}>
      <Icon name="search" className="lead" />
      <input
        ref={setRef} type="search" value={value} placeholder={placeholder} aria-label={label || placeholder}
        className={cx('ix-input', SIZE[size])} autoComplete="off" spellCheck={false}
        onChange={(e) => { onChange?.(e); onValueChange?.(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); clear() } }}
        {...rest}
      />
      <span className="end">
        {value ? (
          <button type="button" className="clear" onClick={clear} aria-label="Clear search"><Icon name="x" /></button>
        ) : hint ? <kbd className="ix-kbd">{hint}</kbd> : null}
      </span>
    </div>
  )
}
