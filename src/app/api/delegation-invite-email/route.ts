import { NextResponse } from "next/server";

type Payload = {
  toEmail: string;
  inviterName?: string | null;
  scopeType: "account" | "project" | "inventory";
  projectTitle?: string | null;
  inviteToken: string;
};

function buildHtml(payload: Payload, acceptUrl: string) {
  const inviter = payload.inviterName?.trim() || "Someone";
  const scope =
    payload.scopeType === "account"
      ? "account management"
      : payload.scopeType === "project"
        ? "an exhibition"
        : "inventory";
  const projectLine =
    payload.scopeType === "project" && payload.projectTitle
      ? ` (“${payload.projectTitle}”)`
      : "";

  return `
  <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #111827;">
    <p><strong>${inviter}</strong> has invited you to manage ${scope}${projectLine} on Abstract.</p>
    <p>To accept, log in or sign up with this email address, then open the link below.</p>
    <p style="margin:24px 0;">
      <a href="${acceptUrl}"
         style="display:inline-block; padding:10px 18px; border-radius:9999px; background:#111827; color:#fff; text-decoration:none; font-size:14px;">
        Accept invitation
      </a>
    </p>
    <p style="color:#6b7280; font-size:12px;">If you didn’t expect this, you can ignore this email.</p>
    <p>— Abstract</p>
  </div>
  `;
}

function buildHtmlKo(payload: Payload, acceptUrl: string) {
  const inviter = payload.inviterName?.trim() || "누군가";
  const scope =
    payload.scopeType === "account"
      ? "계정 관리"
      : payload.scopeType === "project"
        ? "전시"
        : "인벤토리";
  const projectLine =
    payload.scopeType === "project" && payload.projectTitle
      ? ` (「${payload.projectTitle}」)`
      : "";

  return `
  <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #111827;">
    <p><strong>${inviter}</strong>님이 Abstract에서 ${scope}${projectLine} 관리 권한을 위임했습니다.</p>
    <p>수락하려면 이 이메일로 로그인하거나 가입한 뒤 아래 링크를 열어주세요.</p>
    <p style="margin:24px 0;">
      <a href="${acceptUrl}"
         style="display:inline-block; padding:10px 18px; border-radius:9999px; background:#111827; color:#fff; text-decoration:none; font-size:14px;">
        초대 수락하기
      </a>
    </p>
    <p style="color:#6b7280; font-size:12px;">이 메일이 예상치 못한 경우 무시하셔도 됩니다.</p>
    <p>— Abstract</p>
  </div>
  `;
}

const FALLBACK_APP_BASE = "https://abstract-mvp-dxfn.vercel.app";

/** Returns app base URL for invite links. Rejects vercel.com (marketing) so misconfigured env never sends users there. */
function getAppBase(): string {
  const raw =
    (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    (process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).trim()}` : null) ||
    FALLBACK_APP_BASE;
  const base = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const hostname = new URL(base).hostname.toLowerCase();
    if (hostname === "vercel.com" || hostname === "www.vercel.com") {
      console.warn("delegation-invite-email: base was vercel.com, using fallback", { raw });
      return FALLBACK_APP_BASE;
    }
  } catch {
    return FALLBACK_APP_BASE;
  }
  return base.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    if (!body.toEmail || typeof body.toEmail !== "string") {
      return NextResponse.json({ error: "toEmail required" }, { status: 400 });
    }
    if (!body.inviteToken || typeof body.inviteToken !== "string") {
      return NextResponse.json({ error: "inviteToken required" }, { status: 400 });
    }

    const base = getAppBase();
    const acceptUrl = `${base}/invites/delegation?token=${encodeURIComponent(body.inviteToken)}`;

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromRaw = process.env.INVITE_FROM_EMAIL;
    if (!apiKey || !fromRaw) {
      console.error("Missing SENDGRID_API_KEY or INVITE_FROM_EMAIL");
      return NextResponse.json({ error: "Email configuration missing" }, { status: 500 });
    }

    const inviter = body.inviterName?.trim() || "Someone";
    const subjectEn = `${inviter} invited you to manage on Abstract`;
    const subjectKo = `Abstract에서 ${inviter}님이 관리 권한을 위임했습니다`;

    const html = buildHtml(body, acceptUrl) + "<hr/>" + buildHtmlKo(body, acceptUrl);

    const fromMatch = fromRaw.trim().match(/^(.*)<(.+@.+)>$/);
    const from = fromMatch
      ? { email: fromMatch[2].trim(), name: fromMatch[1].trim().replace(/^"|"$/g, "") || undefined }
      : { email: fromRaw.trim(), name: undefined as string | undefined };

    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: body.toEmail }], subject: `${subjectEn} / ${subjectKo}` }],
        from: from.name ? { email: from.email, name: from.name } : { email: from.email },
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("SendGrid delegation invite", resp.status, text);
      return NextResponse.json(
        { error: "Failed to send invite email", sendgridStatus: resp.status },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delegation-invite-email", err);
    return NextResponse.json(
      { error: "Unexpected error", message: (err as Error)?.message },
      { status: 500 }
    );
  }
}
