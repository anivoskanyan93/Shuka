import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../../store';

export default function SellerLayout() {
  const { user } = useStore();
  return (
    <div className="seller">
      <div className="seller-top">
        <div>
          <div className="muted small">SELLER DASHBOARD</div>
          <h1 className="page-title">{user.store_name}</h1>
        </div>
        <nav className="seller-tabs">
          <NavLink end to="/seller">Overview</NavLink>
          <NavLink to="/seller/products">Products</NavLink>
          <NavLink to="/seller/orders">Orders</NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
