import Modal from '../ui/Modal.jsx'
import './layout.css'

const GROUPS = [
  {
    title: 'Global',
    items: [
      { keys: ['⌘', 'K'], label: 'Open search and commands' },
      { keys: ['?'], label: 'Show this sheet' },
      { keys: ['n'], label: 'Open notifications' },
      { keys: ['t'], label: 'Toggle light and dark theme' },
      { keys: ['l'], label: 'Pause or resume live updates' },
      { keys: ['Esc'], label: 'Close whatever is open' },
    ],
  },
  {
    title: 'Go to',
    items: [
      { keys: ['g', 'd'], label: 'Dashboard' },
      { keys: ['g', 's'], label: 'Shipments / arrival board' },
      { keys: ['g', 'm'], label: 'Control tower / dock scheduler' },
      { keys: ['g', 'a'], label: 'Analytics' },
      { keys: ['g', 'c'], label: 'Documents / exceptions' },
    ],
  },
  {
    title: 'Tables',
    items: [
      { keys: ['/'], label: 'Focus the search field' },
      { keys: ['↑', '↓'], label: 'Move between rows' },
      { keys: ['↵'], label: 'Open the highlighted row' },
      { keys: ['Space'], label: 'Select the highlighted row' },
    ],
  },
]

export default function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="Everything here also has a visible control — the keys are a shortcut, never the only way." size="lg">
      <div className="shortcut-grid">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="eyebrow mb-8">{group.title}</h3>
            {group.items.map((item) => (
              <div key={item.label} className="shortcut-row">
                <span className="c-text">{item.label}</span>
                <span className="shortcut-keys">
                  {item.keys.map((k, i) => (
                    <kbd key={`${k}-${i}`}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
