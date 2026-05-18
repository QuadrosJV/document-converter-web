import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";

/**
 * Layout raiz — AuthProvider precisa estar DENTRO da árvore do RouterProvider
 * para que useAuth() funcione em todos os componentes de rota (incluindo Navbar).
 */
function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "editor", Component: EditorPage },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
