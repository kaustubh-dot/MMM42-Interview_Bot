import { LoginScreen } from "@/components/auth/login-screen";
import { currentName, currentRole } from "@/lib/auth/current-role";
import { safeNext } from "@/lib/auth/session";

type Props = { searchParams: Promise<{ next?: string | string[]; as?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, as } = await searchParams;
  return (
    <LoginScreen
      next={safeNext(next, "")}
      initialTab={
        as === "recruiter" || (typeof next === "string" && next.startsWith("/admin"))
          ? "recruiter"
          : "candidate"
      }
      role={await currentRole()}
      name={await currentName()}
      devPasscode={!process.env.ADMIN_PASSCODE?.trim() && process.env.NODE_ENV !== "production"}
    />
  );
}
