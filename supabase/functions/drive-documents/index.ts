// Google Drive document upload, replacing the old "paste a link
// manually" placeholder that was always explicitly labeled as
// awaiting this.
//
// Auth: a stored OAuth2 refresh token (real end-to-end verification
// found a genuine Google platform limitation with the original
// service-account design -- see getDriveAccessToken below for the
// full story). This means the app acts as a specific real Google
// account (a one-time interactive consent grants the refresh token),
// using that account's own Drive storage directly, not a separate,
// independent identity with none of its own.
//
// Auth to THIS function (not to Google) is the same session_token
// pattern every other privileged action in this app already uses,
// matching parse-query-intake's own approach -- not Supabase's own JWT
// verification (deployed with verify_jwt=false).
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Signs in as a real Drive access token using a stored OAuth2 refresh
// token, not a service account. This changed from the original
// service-account design after discovering a real Google platform
// limitation: a service account has zero Drive storage quota of its
// own, and Google no longer lets it create files in a regular
// (non-Shared-Drive) folder even when that folder is explicitly shared
// with it as Editor -- file creation gets attributed to the account
// doing the creating, not the folder owner. Shared Drives and domain-
// wide delegation (Google's own suggested fixes) both require Google
// Workspace, which this account doesn't have -- a personal Gmail
// account genuinely cannot use either. The refresh-token flow is the
// correct, standard approach for "app acts as a specific real person,
// using their own storage" on a personal account: a one-time
// interactive consent grants a long-lived refresh token, which this
// function exchanges for fresh short-lived access tokens on demand.
async function getDriveAccessToken() {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
  const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")?.trim();
  if (!clientId || !clientSecret || !refreshToken) return { error: "Google Drive is not configured yet" };

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) return { error: `Google auth failed: ${data.error_description || data.error || resp.status}` };
  return { token: data.access_token };
}

async function driveFetch(path, accessToken, options = {}) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

// Creates the query's folder if it doesn't already have one (lazy --
// no folder exists until the first real upload), reusing the same
// folder for every subsequent upload rather than creating a new one
// each time.
async function ensureFolder(accessToken, supabase, queryId, folderName) {
  const { data: rows } = await supabase.from("queries").select("drive_folder_id").eq("id", queryId);
  const existing = rows && rows[0] && rows[0].drive_folder_id;
  if (existing) return { folderId: existing };

  const rootFolderId = Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID")?.trim();
  const { ok, data } = await driveFetch("files", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: rootFolderId ? [rootFolderId] : undefined,
    }),
  });
  if (!ok) return { error: `Could not create Drive folder: ${data.error?.message || "unknown error"}` };

  await supabase.from("queries").update({ drive_folder_id: data.id }).eq("id", queryId);
  return { folderId: data.id };
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { token, action } = body;
    if (!token) return json({ success: false, error: "Missing session token" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: staffRows } = await supabase.from("staff").select("id, name, active")
      .eq("session_token", token).eq("active", true).gt("token_expiry", new Date().toISOString());
    if (!staffRows || staffRows.length === 0) return json({ success: false, error: "Session expired, please log in again" }, 401);
    const staffMember = staffRows[0];

    const { token: accessToken, error: authError } = await getDriveAccessToken();
    if (authError) return json({ success: false, error: authError }, 500);

    if (action === "upload") {
      const { queryId, folderName, fileName, mimeType, fileBase64 } = body;
      if (!queryId || !fileName || !fileBase64) return json({ success: false, error: "Missing required fields" }, 400);

      const { folderId, error: folderError } = await ensureFolder(accessToken, supabase, queryId, folderName || queryId);
      if (folderError) return json({ success: false, error: folderError }, 500);

      const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      const boundary = "unitop-drive-upload-boundary";
      const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
      const encoder = new TextEncoder();
      const parts = [
        encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
        encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
        fileBytes,
        encoder.encode(`\r\n--${boundary}--`),
      ];
      const multipartBody = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
      let offset = 0;
      parts.forEach(p => { multipartBody.set(p, offset); offset += p.length; });

      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipartBody,
      });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) return json({ success: false, error: `Drive upload failed: ${uploadData.error?.message || "unknown error"}` }, 500);

      // Real, viewable link -- anyone with access to the folder (i.e.
      // whoever this Drive account shares it with) can open it;
      // webViewLink is the correct one to store, not a raw file id.
      const { data: inserted, error: insertError } = await supabase.from("query_documents").insert({
        query_id: queryId, drive_file_id: uploadData.id, file_name: fileName, file_type: mimeType,
        file_size: fileBytes.length, drive_view_link: uploadData.webViewLink,
        uploaded_by: staffMember.id, uploaded_by_name: staffMember.name,
      }).select();
      if (insertError) return json({ success: false, error: `Uploaded to Drive but failed to record it: ${insertError.message}` }, 500);

      return json({ success: true, document: inserted[0] });
    }

    if (action === "delete") {
      const { documentId } = body;
      if (!documentId) return json({ success: false, error: "Missing documentId" }, 400);
      const { data: docRows } = await supabase.from("query_documents").select("*").eq("id", documentId);
      const doc = docRows && docRows[0];
      if (!doc) return json({ success: false, error: "Document not found" }, 404);

      const { ok, data } = await driveFetch(`files/${doc.drive_file_id}`, accessToken, { method: "DELETE" });
      // 404 from Drive means it's already gone there -- still proceed
      // to remove our own record rather than leaving an orphaned row
      // pointing at nothing.
      if (!ok && data.error?.code !== 404) return json({ success: false, error: `Could not delete from Drive: ${data.error?.message || "unknown error"}` }, 500);

      await supabase.from("query_documents").delete().eq("id", documentId);
      return json({ success: true });
    }

    // Direct request: let a document's file name be changed from
    // within the app after it's already been uploaded, not just at
    // upload time. Renames the real file in Drive (so the two never
    // drift apart) and this app's own record together -- if the Drive
    // side succeeds but the DB update somehow fails, that's reported
    // back explicitly rather than silently leaving them out of sync.
    if (action === "rename-file") {
      const { documentId, newName } = body;
      if (!documentId || !newName || !newName.trim()) return json({ success: false, error: "Missing documentId or newName" }, 400);
      const { data: docRows } = await supabase.from("query_documents").select("*").eq("id", documentId);
      const doc = docRows && docRows[0];
      if (!doc) return json({ success: false, error: "Document not found" }, 404);

      const { ok, data } = await driveFetch(`files/${doc.drive_file_id}`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!ok) return json({ success: false, error: `Could not rename file in Drive: ${data.error?.message || "unknown error"}` }, 500);

      const { data: updated, error: updateError } = await supabase.from("query_documents")
        .update({ file_name: newName.trim() }).eq("id", documentId).select();
      if (updateError) return json({ success: false, error: `Renamed in Drive but failed to update our own record: ${updateError.message}` }, 500);

      return json({ success: true, document: updated[0] });
    }

    if (action === "rename-folder") {
      const { queryId, newName } = body;
      if (!queryId || !newName) return json({ success: false, error: "Missing queryId or newName" }, 400);
      const { data: rows } = await supabase.from("queries").select("drive_folder_id").eq("id", queryId);
      const folderId = rows && rows[0] && rows[0].drive_folder_id;
      if (!folderId) return json({ success: true, skipped: "No Drive folder exists yet for this query" });

      const { ok, data } = await driveFetch(`files/${folderId}`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!ok) return json({ success: false, error: `Could not rename Drive folder: ${data.error?.message || "unknown error"}` }, 500);
      return json({ success: true });
    }

    // One-time setup action: creates a real, app-owned parent folder
    // that every query's own folder will nest inside, instead of them
    // scattering across the top level of the Drive account. Only
    // necessary because of the drive.file scope switch -- that scope
    // only grants access to files/folders the app itself creates, so a
    // manually-made parent folder (the original setup) is no longer
    // reachable, but an app-created one works exactly the same as
    // before. Run this once, then set the returned id as
    // GOOGLE_DRIVE_ROOT_FOLDER_ID.
    if (action === "create-root-folder") {
      const { name } = body;
      const { ok, data } = await driveFetch("files", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Unitop Ops Documents", mimeType: "application/vnd.google-apps.folder" }),
      });
      if (!ok) return json({ success: false, error: `Could not create root folder: ${data.error?.message || "unknown error"}` }, 500);
      return json({ success: true, folderId: data.id, folderName: data.name });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});
