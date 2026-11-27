import { lerEstado } from "@/lib/db";
import Painel from "./Painel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const estado = await lerEstado();
  return <Painel inicial={estado} temLogin={!!process.env.APP_PIN} />;
}
