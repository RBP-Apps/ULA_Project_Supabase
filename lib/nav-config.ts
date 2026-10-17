import {
  LayoutDashboard,
  FileCheck2,
  BriefcaseBusiness,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  ShoppingCart,
  Truck,
  HardHat,
  ShieldCheck,
  FileText,
  PackageCheck,
  WalletCards,
  Gauge,
  Settings2,
  Users,
} from 'lucide-react'
import { NavItem } from './types'

export const navItems: NavItem[] = [
  // Main
  { group: 'Main', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },

  // Project Setup
  { group: 'Project Setup', label: 'Contract & Compliance', path: '/contract-compliance', icon: FileCheck2 },
  { group: 'Project Setup', label: 'Lots & Beneficiaries', path: '/lots', icon: BriefcaseBusiness },
  { group: 'Project Setup', label: 'Work Orders', path: '/work-orders', icon: ClipboardList },

  // Execution
  { group: 'Execution', label: 'Survey', path: '/survey', icon: ClipboardCheck },
  { group: 'Execution', label: 'Design & Simulation', path: '/design', icon: BarChart3 },
  { group: 'Execution', label: 'Material Planning & Purchase', path: '/material-purchase', icon: ShoppingCart },
  { group: 'Execution', label: 'Dispatch & Receiving', path: '/dispatch', icon: Truck },
  { group: 'Execution', label: 'Installation', path: '/installation', icon: HardHat },
  { group: 'Execution', label: 'QC', path: '/qc', icon: ShieldCheck },

  // CSPDCL Process
  { group: 'CSPDCL Process', label: 'Portal Update', path: '/portal-update', icon: FileText },
  { group: 'CSPDCL Process', label: 'JCR Status', path: '/jcr-status', icon: ClipboardCheck },
  { group: 'CSPDCL Process', label: 'Inspection & Commissioning', path: '/commissioning', icon: PackageCheck },

  // Billing & Payment
  { group: 'Billing & Payment', label: 'Lot Docket & Billing', path: '/invoicing', icon: WalletCards },
  { group: 'Billing & Payment', label: 'Payment Tracker', path: '/payment-tracker', icon: WalletCards },
  { group: 'Billing & Payment', label: 'IP Payment', path: '/ip-payment', icon: WalletCards },

  // CMC & Monitoring
  { group: 'CMC & Monitoring', label: 'CMC & Service', path: '/cmc', icon: Gauge },
  { group: 'CMC & Monitoring', label: 'System Info', path: '/system-info', icon: Settings2 },

  // Reports & Administration
  { group: 'Reports', label: 'Reports', path: '/reports', icon: FileText },
  { group: 'Administration', label: 'Settings', path: '/settings', icon: Settings2 },
  { group: 'Administration', label: 'Users & Roles', path: '/users-roles', icon: Users },
]

export const navGroups = Array.from(new Set(navItems.map((item) => item.group)))
