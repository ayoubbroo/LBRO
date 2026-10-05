import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { iconFor } from '../lib/constants'
import type { Status } from '../lib/types'

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n()
  return <span className={'badge st-' + status.toLowerCase()}>{t(('status_' + status.toLowerCase()) as any)}</span>
}
export const TypeLabel = ({ type }: { type: string }) => {
  const { t } = useI18n()
  return <span>{iconFor(type)} {t(('type_' + type) as any)}</span>
}
/** Always tells the user which kind of data they are looking at. */
export function DataKind({ kind }: { kind: 'reports' | 'live' }) {
  const { t } = useI18n()
  return <span className={'badge kind-' + kind}>{kind === 'reports' ? '👥 ' + t('kind_reports') : '📡 ' + t('kind_live')}</span>
}
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  return <div className={'notice ' + tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}
export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  const { t } = useI18n()
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label={t('close')}>✕</button></div>
      {children}
    </div>
  )
}
export const Empty = ({ icon = '🗂️', text }: { icon?: string; text: string }) => <div className="empty"><div style={{ fontSize: 40 }}>{icon}</div><p>{text}</p></div>
export const Spinner = () => <div className="spinner" aria-busy="true" />
