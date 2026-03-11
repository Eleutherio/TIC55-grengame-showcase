// import { RouterProvider } from "react-router-dom";
// import { router } from "./app/routes";
import ResponsiveRouterMobile from "./app/ResponsiveRouterMobile"; // mobile tracking - comentar para usar router tradicional
import SessionTimeoutPrompt from "./components/SessionTimeoutPrompt";

export default function App() {
  // restaurar RouterProvider tradicional após concluir testes mobile.
  // return <RouterProvider router={router} />;
  return (
    <>
      <SessionTimeoutPrompt />
      <ResponsiveRouterMobile />
    </>
  ); // comentar para usar router tradicional
}
