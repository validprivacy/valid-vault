package com.valid.vault;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BrowserScriptsTest {

    @Test
    public void paintAsksForTheTabsBackground() {
        assertEquals("paintStart(5,'day')", BrowserScripts.paint(5, true));
        assertEquals("paintStart(-7,'night')", BrowserScripts.paint(-7, false));
    }

    @Test
    public void repaintForcesTheSameBackgroundToBeDrawnAgain() {
        assertEquals("paintStart(5,'day',true)", BrowserScripts.repaint(5, true));
        assertEquals("paintStart(-7,'night',true)", BrowserScripts.repaint(-7, false));
    }

    @Test
    public void startPageAllowsItsBackgroundWorkerAndNothingFromTheNetwork() {
        String html = BrowserScripts.startHtml("A", "B", "C");
        assertTrue(html.contains("default-src 'none'"));
        assertTrue(html.contains("worker-src blob:"));
        assertTrue(html.contains("<script id=\"art\">A</script><script id=\"paint\">B</script><script>C</script>"));
    }
}
