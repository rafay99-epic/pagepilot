import { TRPCProvider } from "@/trpc/provider";
import DashboardList from "./list";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <TRPCProvider>
      <DashboardList />
    </TRPCProvider>
  );
}
