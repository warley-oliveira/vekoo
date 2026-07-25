import { Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/app-shell"
import { BrandsPage, TemplatesPage } from "@/routes/coming-soon"
import { MyCarouselsPage } from "@/routes/my-carousels"
import { TrashPage } from "@/routes/trash"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<MyCarouselsPage />} />
        <Route path="/pastas/:folderId" element={<MyCarouselsPage />} />
        <Route path="/modelos" element={<TemplatesPage />} />
        <Route path="/marcas" element={<BrandsPage />} />
        <Route path="/lixeira" element={<TrashPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
