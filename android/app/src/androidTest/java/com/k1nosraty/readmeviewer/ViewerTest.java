package com.k1nosraty.readmeviewer;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.rule.ActivityTestRule;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class ViewerTest {
    @Rule public ActivityTestRule<MainActivity> activity = new ActivityTestRule<>(MainActivity.class);
    private String evaluate(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.getActivity().runOnUiThread(() -> activity.getActivity().web.evaluateJavascript(script, value -> {
            result.set(value); latch.countDown();
        }));
        assertTrue("WebView did not respond", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    @Test public void offlineViewerBootsAndEditsPersianTasks() throws Exception {
        boolean loaded = false;
        for (int i = 0; i < 100; i++) {
            if ("true".equals(evaluate("Boolean(window.RVApp && window.RVApp.el.editor)"))) { loaded = true; break; }
            Thread.sleep(100);
        }
        assertTrue("Packaged viewer failed to boot", loaded);
        assertEquals("Native save bridge unavailable", "true", evaluate("window.RV.Android.available()"));
        evaluate("RVApp.setDoc('# Test\\n\\n- [ ] یادگیری PostgreSQL\\n', 'test.md', null); RVApp.setMode('preview'); RVApp.setEditPreview(true); document.querySelector('#preview input').click();");
        assertEquals("Task edit failed: " + evaluate("JSON.stringify({source:RVApp.el.editor.value, tasks:RVApp.state.tasks, reason:RVApp.state.taskReason, preview:RVApp.el.preview.textContent})"), "true", evaluate("RVApp.el.editor.value.includes('[x]') && RVApp.state.dirty"));
        assertEquals("Preview collapsed", "true", evaluate("document.getElementById('panePreview').getBoundingClientRect().width > 100"));
        assertEquals("Native save method unavailable", "true", evaluate("typeof AndroidFiles.save === 'function'"));
    }
}
