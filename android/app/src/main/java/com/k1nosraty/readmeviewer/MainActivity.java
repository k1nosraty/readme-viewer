package com.k1nosraty.readmeviewer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/index.html";
    private static final int OPEN = 10, SAVE = 11;
    WebView web;
    private ValueCallback<Uri[]> chooser;
    private String pendingText, pendingId;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setSupportMultipleWindows(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                if (response != null) return response;
                // The native bridge is available only to packaged, offline content.
                return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOME.equals(uri.toString().split("#")[0])) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()) || "mailto".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(intent, OPEN); }
                catch (Exception error) { chooser.onReceiveValue(null); chooser = null; }
                return true;
            }
        });
        web.addJavascriptInterface(new FilesBridge(), "AndroidFiles");
        web.loadUrl(HOME);
    }

    public class FilesBridge {
        @JavascriptInterface public void save(String text, String name, String mime, String id) {
            runOnUiThread(() -> {
                if (pendingId != null) { respond(id, false, "Another save is still open."); return; }
                pendingText = text;
                pendingId = id;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime.split(";")[0]);
                intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/\\p{Cntrl}]", "_"));
                try { startActivityForResult(intent, SAVE); }
                catch (Exception error) { finishSave(false, error.getMessage()); }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = data == null ? null : data.getData();
        if (request == OPEN && chooser != null) {
            chooser.onReceiveValue(result == RESULT_OK && uri != null ? new Uri[] { uri } : null);
            chooser = null;
        }
        if (request == SAVE && pendingId != null) {
            if (result != RESULT_OK || uri == null) { finishSave(false, "Save cancelled."); return; }
            try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("Cannot open the selected destination.");
                stream.write(pendingText.getBytes(StandardCharsets.UTF_8));
                finishSave(true, "");
            } catch (Exception error) { finishSave(false, error.getMessage()); }
        }
    }

    private void finishSave(boolean ok, String reason) {
        String id = pendingId;
        pendingId = null;
        pendingText = null;
        respond(id, ok, reason);
    }
    private void respond(String id, boolean ok, String reason) {
        web.evaluateJavascript("window.RV.Android.complete(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(reason == null ? "" : reason) + ")", null);
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("Boolean(window.RVApp && window.RVApp.state.dirty)", dirty -> {
            if ("true".equals(dirty)) {
                new AlertDialog.Builder(this).setTitle("Unsaved changes")
                    .setMessage("Save your changes before leaving, or discard them?")
                    .setNegativeButton("Keep editing", null)
                    .setPositiveButton("Discard and exit", (dialog, which) -> finish()).show();
            } else finish();
        });
    }
    @Override protected void onDestroy() {
        if (chooser != null) chooser.onReceiveValue(null);
        web.removeJavascriptInterface("AndroidFiles");
        web.destroy();
        super.onDestroy();
    }
}
