import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './style.css'
import { I18nProvider } from './i18n'
import { AuthProvider } from './lib/auth'
import { AppProvider } from './lib/app'
import Layout from './components/Layout'
import MapPage from './pages/MapPage'
import ReportsPage from './pages/ReportsPage'
import RoutesPage from './pages/RoutesPage'
import FavoritesPage from './pages/FavoritesPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import { CitiesPage, CityPage } from './pages/CitiesPage'
import AdminPage from './pages/AdminPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><AuthProvider><AppProvider><BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MapPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="cities" element={<CitiesPage />} />
          <Route path="cities/:id" element={<CityPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<MapPage />} />
        </Route>
      </Routes>
    </BrowserRouter></AppProvider></AuthProvider></I18nProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
