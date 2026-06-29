"use client";

import * as React from "react";
import { Copy, Link2, Mail, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  url: string;
  title: string;
  className?: string;
};

function encode(s: string) {
  return encodeURIComponent(s);
}

export default function ShareButtons({ url, title, className }: Props) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  const xHref = `https://twitter.com/intent/tweet?text=${encode(title)}&url=${encode(url)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`;
  const waHref = `https://wa.me/?text=${encode(`${title}\n${url}`)}`;
  const mailHref = `mailto:?subject=${encode(title)}&body=${encode(url)}`;

  return (
    <div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      <Button type="button" variant="outline" size="sm" className="rounded-full gap-2" onClick={onCopy}>
        <Copy className="h-4 w-4" />
        {copied ? "Copié" : "Copier le lien"}
      </Button>

      <a href={liHref} target="_blank" rel="noreferrer">
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-2">
          <Share2 className="h-4 w-4" />
          LinkedIn
        </Button>
      </a>

      <a href={xHref} target="_blank" rel="noreferrer">
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-2">
          <Link2 className="h-4 w-4" />
          X
        </Button>
      </a>

      <a href={waHref} target="_blank" rel="noreferrer">
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-2">
          <Share2 className="h-4 w-4" />
          WhatsApp
        </Button>
      </a>

      <a href={mailHref}>
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-2">
          <Mail className="h-4 w-4" />
          Email
        </Button>
      </a>
    </div>
  );
}
