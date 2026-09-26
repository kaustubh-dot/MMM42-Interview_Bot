import { LoginScreen } from "@/components/auth/login-screen";
import { safeNext } from "@/lib/auth/session";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const target = safeNext(next, "");
  return (
    <LoginScreen
      next={target}
      devPasscode={!process.env.ADMIN_PASSCODE?.trim() && process.env.NODE_ENV !== "production"}
    />
  );
}
