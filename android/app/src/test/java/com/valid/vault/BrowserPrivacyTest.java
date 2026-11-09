package com.valid.vault;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class BrowserPrivacyTest {

    private static final Set<String> NONE = Collections.emptySet();

    @Test
    public void hostIsMatchesWholeLabelsOnly() {
        assertTrue(BrowserPrivacy.hostIs("google.com", "google.com"));
        assertTrue(BrowserPrivacy.hostIs("mail.google.com", "google.com"));
        assertFalse(BrowserPrivacy.hostIs("evilgoogle.com", "google.com"));
        assertFalse(BrowserPrivacy.hostIs("google.com.evil.com", "google.com"));
        assertFalse(BrowserPrivacy.hostIs(null, "google.com"));
    }

    @Test
    public void hostOfReadsTheRealHost() {
        assertEquals("evil.com", BrowserPrivacy.hostOf("https://bank.com@EVIL.com:8443/x?y#z"));
        assertEquals("evil.com", BrowserPrivacy.hostOf("https://evil.com./"));
        assertEquals("evil.com", BrowserPrivacy.hostOf("https://evil.com\\@bank.com/"));
        assertEquals("", BrowserPrivacy.hostOf("javascript:alert(1)"));
        assertEquals("", BrowserPrivacy.hostOf(null));
    }

    @Test
    public void unwrapFollowsKnownRedirectorsToWebPagesOnly() {
        assertEquals("https://example.com/a?b=1", BrowserPrivacy.unwrap("https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&sa=D"));
        assertEquals("https://example.com/", BrowserPrivacy.unwrap("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F&h=AT0"));
        assertEquals("https://example.com/", BrowserPrivacy.unwrap("https://out.reddit.com/t3_x?url=https%3A%2F%2Fexample.com%2F"));
        assertNull(BrowserPrivacy.unwrap("https://www.google.com/url?q=javascript%3Aalert(1)"));
        assertNull(BrowserPrivacy.unwrap("https://www.google.com/url?q=data%3Atext%2Fhtml%2Cx"));
        assertNull(BrowserPrivacy.unwrap("https://l.facebook.com/l.php?u=javascript%3Aalert(1)"));
        assertNull(BrowserPrivacy.unwrap("https://out.reddit.com/x?url=intent%3A%2F%2Fevil%23Intent%3Bend"));
        assertNull(BrowserPrivacy.unwrap("https://www.google.com/search?q=https%3A%2F%2Fexample.com%2F"));
        assertNull(BrowserPrivacy.unwrap("https://example.com/url?q=https%3A%2F%2Fother.com%2F"));
    }

    @Test
    public void stripParamsRemovesTrackingOnly() {
        assertEquals("https://example.com/p?id=7#top", BrowserPrivacy.stripParams("https://example.com/p?utm_source=x&id=7&fbclid=abc&UTM_Medium=y#top"));
        assertEquals("https://example.com/p", BrowserPrivacy.stripParams("https://example.com/p?gclid=1&utm_campaign=2"));
        assertEquals("https://example.com/p?id=7", BrowserPrivacy.stripParams("https://example.com/p?id=7"));
        assertEquals("https://www.youtube.com/watch?v=abc", BrowserPrivacy.stripParams("https://www.youtube.com/watch?v=abc&si=XYZ"));
        assertEquals("https://example.com/watch?v=abc&si=XYZ", BrowserPrivacy.stripParams("https://example.com/watch?v=abc&si=XYZ"));
    }

    @Test
    public void cleanUnwrapsThenStrips() {
        assertEquals("https://example.com/a", BrowserPrivacy.clean("https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa%3Futm_source%3Dg"));
        assertEquals("javascript:alert(1)", BrowserPrivacy.clean("javascript:alert(1)"));
    }

    @Test
    public void siteOfGroupsSubdomainsButNotSharedHosts() {
        assertEquals("bank.com", BrowserPrivacy.siteOf("login.Bank.com."));
        assertEquals("bbc.co.uk", BrowserPrivacy.siteOf("www.bbc.co.uk"));
        assertEquals("alice.github.io", BrowserPrivacy.siteOf("alice.github.io"));
        assertEquals("alice.github.io", BrowserPrivacy.siteOf("docs.alice.github.io"));
        assertEquals("192.168.1.1", BrowserPrivacy.siteOf("192.168.1.1"));
        assertEquals("", BrowserPrivacy.siteOf(null));
    }

    @Test
    public void trackersAreBlockedOnOtherSites() {
        assertTrue(BrowserPrivacy.shouldBlock("https://www.google-analytics.com/collect", "news.example.com", NONE));
        assertTrue(BrowserPrivacy.shouldBlock("https://connect.facebook.net/en_US/fbevents.js", "shop.example.com", NONE));
        assertTrue(BrowserPrivacy.shouldBlock("https://www.facebook.com/tr?id=1", "shop.example.com", NONE));
        assertTrue(BrowserPrivacy.shouldBlock("https://stats.g.doubleclick.net/x", "news.example.com", NONE));
    }

    @Test
    public void trackersAreNotBlockedOnTheirOwnSite() {
        assertFalse(BrowserPrivacy.shouldBlock("https://www.facebook.com/tr?id=1", "www.facebook.com", NONE));
        assertFalse(BrowserPrivacy.shouldBlock("https://www.hotjar.com/script.js", "www.hotjar.com", NONE));
    }

    @Test
    public void ordinaryRequestsAreNotBlocked() {
        assertFalse(BrowserPrivacy.shouldBlock("https://cdn.example.com/app.js", "www.example.com", NONE));
        assertFalse(BrowserPrivacy.shouldBlock("https://www.facebook.com/profile", "shop.example.com", NONE));
        assertFalse(BrowserPrivacy.shouldBlock("data:image/png;base64,AA", "shop.example.com", NONE));
        assertFalse(BrowserPrivacy.shouldBlock("https://evilgoogle-analytics.com/x", "news.example.com", NONE));
    }

    @Test
    public void sitesTheOwnerAllowedAreLeftAlone() {
        Set<String> allowed = new HashSet<>(Collections.singletonList("example.com"));
        assertFalse(BrowserPrivacy.shouldBlock("https://www.google-analytics.com/collect", "news.example.com", allowed));
        assertTrue(BrowserPrivacy.shouldBlock("https://www.google-analytics.com/collect", "news.other.com", allowed));
        assertFalse(BrowserPrivacy.siteAllowed("example.com.evil.com", allowed));
    }

    @Test
    public void pinsAcceptOnlyWebAddresses() {
        assertEquals("https://example.com/a", BrowserPins.normalizeUrl("  https://example.com/a#frag "));
        assertNull(BrowserPins.normalizeUrl("javascript:alert(1)"));
        assertNull(BrowserPins.normalizeUrl("file:///sdcard/x.html"));
        assertNull(BrowserPins.normalizeUrl("ftp://example.com/file"));
        assertNull(BrowserPins.normalizeUrl("intent://example.com/#Intent;end"));
        assertNull(BrowserPins.normalizeUrl("https://"));
        assertNull(BrowserPins.normalizeUrl(null));
        StringBuilder longUrl = new StringBuilder("https://example.com/");
        while (longUrl.length() <= BrowserPins.MAX_URL_LENGTH) longUrl.append('a');
        assertNull(BrowserPins.normalizeUrl(longUrl.toString()));
    }
}
