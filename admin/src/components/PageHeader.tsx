import { useNavigate } from 'react-router-dom'
import './PageHeader.css'

type PageHeaderProps = {
  title?: string
  onRefresh?: () => void | Promise<void>
  refreshLabel?: string
}

export function PageHeader({ title, onRefresh, refreshLabel = 'Actualiser' }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="page-header-toolbar">
      <button type="button" className="secondary page-header-back" onClick={() => navigate(-1)}>
        ← Retour
      </button>
      {onRefresh ? (
        <button
          type="button"
          className="secondary page-header-refresh"
          onClick={() => {
            void onRefresh()
          }}
        >
          {refreshLabel}
        </button>
      ) : null}
      {title ? <span className="page-header-title-inline">{title}</span> : null}
    </div>
  )
}
