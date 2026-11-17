// Navigation per context. Icons are lucide names resolved in the client shell.
export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };
export type Nav = { groups: NavGroup[]; dock: NavItem[]; primary?: NavItem };

export const NAV: Record<string, Nav> = {
  RECIPIENT: {
    primary: { href: "/org/tickets/new", label: "Raise a ticket", icon: "plus" },
    groups: [
      { label: "Food", items: [{ href: "/org", label: "Overview", icon: "home" }, { href: "/org/tickets", label: "Tickets", icon: "ticket" }, { href: "/org/surplus", label: "Available surplus", icon: "salad" }, { href: "/org/recurring", label: "Recurring needs", icon: "repeat" }] },
      { label: "Deliveries", items: [{ href: "/org/deliveries", label: "Collections & deliveries", icon: "truck" }, { href: "/reports", label: "Impact", icon: "chart" }] },
      { label: "Organisation", items: [{ href: "/org/profile", label: "Profile & verification", icon: "badge" }, { href: "/org/team", label: "Team", icon: "users" }] },
    ],
    dock: [{ href: "/org", label: "Home", icon: "home" }, { href: "/org/tickets/new", label: "Raise", icon: "plus" }, { href: "/org/tickets", label: "Offers", icon: "ticket" }, { href: "/org/deliveries", label: "Handover", icon: "truck" }],
  },
  RESTAURANT: {
    primary: { href: "/restaurant/surplus/new", label: "List surplus", icon: "plus" },
    groups: [
      { label: "Donate", items: [{ href: "/restaurant", label: "Overview", icon: "home" }, { href: "/restaurant/surplus", label: "Surplus batches", icon: "salad" }, { href: "/restaurant/needs", label: "Nearby needs", icon: "map" }, { href: "/org/deliveries", label: "Handovers", icon: "truck" }] },
      { label: "Buy", items: [{ href: "/market", label: "Ingredient marketplace", icon: "store" }, { href: "/restaurant/watchlists", label: "Watchlists", icon: "eye" }, { href: "/orders", label: "Grocery orders", icon: "bag" }] },
      { label: "Business", items: [{ href: "/reports", label: "Reports", icon: "chart" }, { href: "/org/profile", label: "Profile", icon: "badge" }, { href: "/org/team", label: "Team", icon: "users" }] },
    ],
    dock: [{ href: "/restaurant", label: "Home", icon: "home" }, { href: "/restaurant/surplus/new", label: "List", icon: "plus" }, { href: "/restaurant/needs", label: "Needs", icon: "map" }, { href: "/org/deliveries", label: "Handover", icon: "truck" }],
  },
  SUPERMARKET: {
    primary: { href: "/supermarket/products", label: "Add stock", icon: "plus" },
    groups: [
      { label: "Stock", items: [{ href: "/supermarket", label: "Overview", icon: "home" }, { href: "/supermarket/products", label: "Products & batches", icon: "package" }, { href: "/supermarket/import", label: "Stock import", icon: "upload" }, { href: "/supermarket/discounts", label: "Discount rules", icon: "percent" }] },
      { label: "Sales", items: [{ href: "/supermarket/orders", label: "Orders & collection", icon: "bag" }, { href: "/reports", label: "Reports", icon: "chart" }] },
      { label: "Business", items: [{ href: "/org/profile", label: "Profile", icon: "badge" }, { href: "/org/team", label: "Team", icon: "users" }] },
    ],
    dock: [{ href: "/supermarket", label: "Home", icon: "home" }, { href: "/supermarket/products", label: "Stock", icon: "package" }, { href: "/supermarket/orders", label: "Orders", icon: "bag" }],
  },
  LOGISTICS: {
    groups: [
      { label: "Dispatch", items: [{ href: "/logistics", label: "Dispatch board", icon: "truck" }, { href: "/driver", label: "My assigned jobs", icon: "route" }] },
      { label: "Team", items: [{ href: "/org/profile", label: "Profile", icon: "badge" }, { href: "/org/team", label: "Team & vehicles", icon: "users" }] },
    ],
    dock: [{ href: "/logistics", label: "Dispatch", icon: "truck" }, { href: "/driver", label: "My jobs", icon: "route" }],
  },
  DRIVER: { groups: [{ label: "Collections", items: [{ href: "/driver", label: "My assigned jobs", icon: "route" }] }], dock: [{ href: "/driver", label: "My jobs", icon: "route" }] },
  PERSONAL: {
    groups: [
      { label: "Shop", items: [{ href: "/market", label: "Marketplace", icon: "store" }, { href: "/cart", label: "Cart", icon: "cart" }, { href: "/orders", label: "My orders", icon: "bag" }] },
      { label: "Join", items: [{ href: "/apply", label: "Register an organisation", icon: "badge" }] },
    ],
    dock: [{ href: "/market", label: "Shop", icon: "store" }, { href: "/cart", label: "Cart", icon: "cart" }, { href: "/orders", label: "Orders", icon: "bag" }],
  },
  ADMIN: {
    groups: [
      { label: "Operations", items: [{ href: "/admin", label: "Operations", icon: "gauge" }, { href: "/admin/ops", label: "Exceptions", icon: "alert" }, { href: "/logistics", label: "Logistics", icon: "truck" }, { href: "/admin/tickets", label: "Tickets & allocations", icon: "ticket" }, { href: "/admin/orders", label: "Grocery orders", icon: "bag" }] },
      { label: "Trust", items: [{ href: "/admin/verification", label: "Verification", icon: "badge" }, { href: "/admin/tenants", label: "Organisations & users", icon: "users" }, { href: "/admin/complaints", label: "Complaints", icon: "flag" }] },
      { label: "Platform", items: [{ href: "/reports", label: "Reports", icon: "chart" }, { href: "/admin/policy", label: "Policy settings", icon: "sliders" }, { href: "/admin/audit", label: "Audit log", icon: "scroll" }] },
    ],
    dock: [{ href: "/admin", label: "Ops", icon: "gauge" }, { href: "/admin/verification", label: "Verify", icon: "badge" }, { href: "/logistics", label: "Logistics", icon: "truck" }],
  },
};
