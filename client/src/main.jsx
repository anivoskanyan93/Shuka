import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { StoreProvider } from './store';
import Layout from './components/Layout';
import { RequireAuth } from './components/ui';
import Home from './pages/Home';
import Search from './pages/Search';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import { Login, Register } from './pages/Auth';
import Account from './pages/Account';
import { Orders, OrderDetail, OrderPlaced } from './pages/Orders';
import BecomeSeller from './pages/seller/BecomeSeller';
import SellerLayout from './pages/seller/SellerLayout';
import Overview from './pages/seller/Overview';
import SellerProducts from './pages/seller/Products';
import ProductEditor from './pages/seller/ProductEditor';
import { SellerOrders, SellerOrderDetail } from './pages/seller/Orders';
import NotFound from './pages/NotFound';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="c/:slug" element={<Search />} />
            <Route path="p/:id" element={<Product />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="cart" element={<RequireAuth><Cart /></RequireAuth>} />
            <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
            <Route path="orders" element={<RequireAuth><Orders /></RequireAuth>} />
            <Route path="orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
            <Route path="orders/:id/placed" element={<RequireAuth><OrderPlaced /></RequireAuth>} />
            <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="sell" element={<RequireAuth><BecomeSeller /></RequireAuth>} />
            <Route path="seller" element={<RequireAuth seller><SellerLayout /></RequireAuth>}>
              <Route index element={<Overview />} />
              <Route path="products" element={<SellerProducts />} />
              <Route path="products/new" element={<ProductEditor />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="orders" element={<SellerOrders />} />
              <Route path="orders/:id" element={<SellerOrderDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
