// Tracking collector + snippet server. Public (no JWT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function snippet(publicKey: string, endpoint: string, pixels: Array<{ platform: string; pixel_id: string }>) {
  const pixelInit = pixels
    .map((p) => {
      if (p.platform === "meta") {
        return `try{!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${p.pixel_id}');fbq('track','PageView');}catch(e){}`;
      }
      if (p.platform === "google") {
        return `try{var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${p.pixel_id}';document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${p.pixel_id}');}catch(e){}`;
      }
      if (p.platform === "tiktok") {
        return `try{!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${p.pixel_id}');ttq.page();}(window, document, 'ttq')}catch(e){}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return `// Lovable Tracking ${publicKey}
(function(){
  var ENDPOINT=${JSON.stringify(endpoint)};
  var KEY=${JSON.stringify(publicKey)};
  function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
  function getAnon(){try{var k='_lvanon';var v=localStorage.getItem(k);if(!v){v=uid();localStorage.setItem(k,v)}return v}catch(e){return uid()}}
  function getSess(){try{var k='_lvsess';var v=sessionStorage.getItem(k);if(!v){v=uid();sessionStorage.setItem(k,v)}return v}catch(e){return uid()}}
  function send(name, props){
    try{
      var body=JSON.stringify({k:KEY,n:name,p:props||{},u:location.href,r:document.referrer,a:getAnon(),s:getSess()});
      if(navigator.sendBeacon){navigator.sendBeacon(ENDPOINT, new Blob([body],{type:'application/json'}))}
      else{fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true})}
    }catch(e){}
  }
  var queue=window.lv&&window.lv.q||[];
  function lv(){var a=Array.prototype.slice.call(arguments);if(a[0]==='event'){send(a[1], a[2])}}
  lv.q=[];
  window.lv=lv;
  // Replay queued
  queue.forEach(function(args){lv.apply(null,args)});
  // Auto pageview
  send('pageview',{title:document.title});
  // SPA navigation
  var lastUrl=location.href;
  setInterval(function(){if(location.href!==lastUrl){lastUrl=location.href;send('pageview',{title:document.title})}},1000);
  // Pixels
  ${pixelInit}
})();
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // Snippet GET: /track?key=XYZ
  if (req.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key) return new Response("missing key", { status: 400, headers: corsHeaders });

    const { data: container } = await admin
      .from("tracking_containers")
      .select("id, public_key, enabled")
      .eq("public_key", key)
      .maybeSingle();

    if (!container || !container.enabled) {
      return new Response("// container not found", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/javascript" },
      });
    }

    const { data: pixels } = await admin
      .from("tracking_pixels")
      .select("platform, pixel_id")
      .eq("container_id", container.id)
      .eq("enabled", true);

    const endpoint = `${SUPABASE_URL}/functions/v1/track`;
    return new Response(snippet(key, endpoint, pixels || []), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  // POST collect
  try {
    const body = await req.json();
    const { k, n, p, u, r, a, s } = body || {};
    if (!k || !n) return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: corsHeaders });

    const { data: container } = await admin
      .from("tracking_containers")
      .select("id, workspace_id, client_id, enabled, ad_account_id")
      .eq("public_key", k)
      .maybeSingle();
    if (!container || !container.enabled)
      return new Response(JSON.stringify({ ok: false }), { status: 200, headers: corsHeaders });

    const ua = req.headers.get("user-agent") || "";
    const ip = req.headers.get("x-forwarded-for") || "";
    const ipHash = ip ? btoa(ip).slice(0, 24) : null;

    // Only stamp account on events when a specific account is selected.
    // "all" = notifications only, do not attach to per-account report.
    const eventAccountId =
      container.ad_account_id && container.ad_account_id !== "all"
        ? container.ad_account_id
        : null;

    await admin.from("tracking_events").insert({
      container_id: container.id,
      workspace_id: container.workspace_id,
      client_id: container.client_id,
      ad_account_id: eventAccountId,
      event_name: String(n).slice(0, 120),
      properties: p || {},
      url: u ? String(u).slice(0, 2000) : null,
      referrer: r ? String(r).slice(0, 2000) : null,
      user_agent: ua.slice(0, 500),
      ip_hash: ipHash,
      anon_id: a ? String(a).slice(0, 80) : null,
      session_id: s ? String(s).slice(0, 80) : null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
