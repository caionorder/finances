import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from './components/theme/ThemeProvider'
import { AuthProvider } from './features/auth/AuthContext'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { LoginPage } from './features/auth/LoginPage'
import { AppLayout } from './components/layout/AppLayout'
import { UsersPage } from './features/users/UsersPage'
import { AccountsPage } from './features/accounts/AccountsPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { TransactionsPage } from './features/transactions/TransactionsPage'
import { CreditCardsPage } from './features/credit-cards/CreditCardsPage'
import { CreditCardDetailPage } from './features/credit-cards/CreditCardDetailPage'
import { InvestmentsPage } from './features/investments/InvestmentsPage'
import { InvestmentDetailPage } from './features/investments/InvestmentDetailPage'
import { PayablesPage } from './features/payables/PayablesPage'
import { ReceivablesPage } from './features/receivables/ReceivablesPage'
import { RecurrencesPage } from './features/recurrences/RecurrencesPage'
import { FacturasPage } from './features/facturas/FacturasPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import Root from './routes/root'
import Home from './routes/home'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Home /> },
              { path: 'accounts', element: <AccountsPage /> },
              { path: 'credit-cards', element: <CreditCardsPage /> },
              { path: 'credit-cards/:id', element: <CreditCardDetailPage /> },
              { path: 'investments', element: <InvestmentsPage /> },
              { path: 'investments/:id', element: <InvestmentDetailPage /> },
              { path: 'transactions', element: <TransactionsPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'payables', element: <PayablesPage /> },
              { path: 'receivables', element: <ReceivablesPage /> },
              { path: 'recurrences', element: <RecurrencesPage /> },
              { path: 'facturas', element: <FacturasPage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
