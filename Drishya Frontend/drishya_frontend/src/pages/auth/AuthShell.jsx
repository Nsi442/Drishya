import { Link } from 'react-router-dom'
import Logo from '../../components/Logo.jsx'
import Icon from '../../components/ui/Icon.jsx'
import './auth.css'

const POINTS = [
  {
    icon: 'truck',
    title: 'One live view, three parties',
    desc: 'The vendor dispatching, the driver carrying and the fulfilment centre receiving all read the same shipment record.',
  },
  {
    icon: 'file',
    title: 'Paperwork checked before the gate',
    desc: 'E-way bill validity, invoice and GST details are validated against the booking, not discovered at receiving.',
  },
  {
    icon: 'calendar',
    title: 'Dock slots that reflect reality',
    desc: 'A predicted arrival that has slipped releases its slot to the next vendor in the cluster instead of holding it empty.',
  },
]

// Shared frame for every unauthenticated screen.
export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <section className="auth-brand">
        <Link to="/" aria-label="Drishya home" style={{ position: 'relative', zIndex: 1, width: 'fit-content' }}>
          <Logo variant="horizontal" size={36} tagline />
        </Link>

        <div className="auth-brand-body">
          <h2 className="auth-headline">
            Know where every consignment is, and whether it will <em>clear the gate</em>.
          </h2>
          <p className="auth-lede">
            Drishya gives vendors delivering into marketplace fulfilment centres live position, an honest arrival time
            and compliance that is checked in advance rather than at the dock.
          </p>

          <div className="auth-points">
            {POINTS.map((p) => (
              <div key={p.title} className="auth-point">
                <span className="auth-point-icon">
                  <Icon name={p.icon} size={16} />
                </span>
                <div>
                  <p className="auth-point-title">{p.title}</p>
                  <p className="auth-point-desc">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="auth-foot">Drishya · दृश्य — that which is seen</p>
      </section>

      <section className="auth-panel">
        <div className="auth-form">{children}</div>
      </section>
    </div>
  )
}
