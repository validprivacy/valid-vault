package com.valid.vault;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BrowserFillTest {

    @Test
    public void originKeepsSchemeHostAndNonStandardPort() {
        assertEquals("https://bank.com", BrowserFill.originOf("https://bank.com/login?next=/home#top"));
        assertEquals("https://bank.com", BrowserFill.originOf("HTTPS://Bank.COM/login"));
        assertEquals("https://bank.com:8443", BrowserFill.originOf("https://bank.com:8443/login"));
        assertEquals("http://intranet.local:8080", BrowserFill.originOf("http://intranet.local:8080/"));
    }

    @Test
    public void originDropsStandardPorts() {
        assertEquals("https://bank.com", BrowserFill.originOf("https://bank.com:443/login"));
        assertEquals("http://bank.com", BrowserFill.originOf("http://bank.com:80/login"));
        assertEquals("http://bank.com:443", BrowserFill.originOf("http://bank.com:443/"));
    }

    @Test
    public void originUsesTheRealHostWhenTheUrlHidesIt() {
        assertEquals("https://evil.com", BrowserFill.originOf("https://bank.com@evil.com/login"));
        assertEquals("https://evil.com", BrowserFill.originOf("https://bank.com:pw@evil.com/"));
        assertEquals("https://evil.com", BrowserFill.originOf("https://evil.com\\@bank.com/"));
        assertEquals("https://evil.com", BrowserFill.originOf("https://evil.com?@bank.com/"));
        assertEquals("https://evil.com", BrowserFill.originOf("https://evil.com#@bank.com/"));
    }

    @Test
    public void originHandlesIpv6Hosts() {
        assertEquals("https://[::1]:8443", BrowserFill.originOf("https://[::1]:8443/login"));
        assertEquals("https://[::1]", BrowserFill.originOf("https://[::1]/"));
        assertNull(BrowserFill.originOf("https://[::1/"));
        assertNull(BrowserFill.originOf("https://[::1]junk/"));
    }

    @Test
    public void originRefusesAnythingThatIsNotAWebPage() {
        assertNull(BrowserFill.originOf(null));
        assertNull(BrowserFill.originOf(""));
        assertNull(BrowserFill.originOf("javascript:alert(1)"));
        assertNull(BrowserFill.originOf("data:text/html,<form>"));
        assertNull(BrowserFill.originOf("file:///sdcard/login.html"));
        assertNull(BrowserFill.originOf("content://com.example/login"));
        assertNull(BrowserFill.originOf("://bank.com"));
        assertNull(BrowserFill.originOf("https:///login"));
        assertNull(BrowserFill.originOf("https://user@/login"));
    }

    @Test
    public void originRefusesBadPorts() {
        assertNull(BrowserFill.originOf("https://bank.com:0/"));
        assertNull(BrowserFill.originOf("https://bank.com:65536/"));
        assertNull(BrowserFill.originOf("https://bank.com:-1/"));
        assertNull(BrowserFill.originOf("https://bank.com:44a/"));
    }

    @Test
    public void sameHostIgnoresCaseAndATrailingDotOnly() {
        assertTrue(BrowserFill.sameHost("Bank.com", "bank.com."));
        assertFalse(BrowserFill.sameHost("bank.com", "login.bank.com"));
        assertFalse(BrowserFill.sameHost("bank.com", "bank.com.evil.com"));
        assertFalse(BrowserFill.sameHost("", ""));
        assertFalse(BrowserFill.sameHost(null, "bank.com"));
        assertFalse(BrowserFill.sameHost("bank.com", null));
    }

    @Test
    public void domainOfReadsTheRealHost() {
        assertEquals("evil.com", BrowserFill.domainOf("https://bank.com@Evil.com./login"));
        assertEquals("", BrowserFill.domainOf("javascript:alert(1)"));
    }

    @Test
    public void secureMeansHttpsOnly() {
        assertTrue(BrowserFill.secure("https://bank.com/"));
        assertTrue(BrowserFill.secure("HTTPS://bank.com/"));
        assertFalse(BrowserFill.secure("http://bank.com/"));
        assertFalse(BrowserFill.secure("javascript:https://bank.com"));
        assertFalse(BrowserFill.secure(null));
    }

    @Test
    public void fingerprintSeparatesUsernameFromPassword() {
        String a = BrowserFill.fingerprint("ab", "c");
        String b = BrowserFill.fingerprint("a", "bc");
        assertEquals(64, a.length());
        assertNotEquals(a, b);
        assertEquals(a, BrowserFill.fingerprint("ab", "c"));
        assertEquals(BrowserFill.fingerprint("", ""), BrowserFill.fingerprint(null, null));
    }

    @Test
    public void fingerprintNeverContainsThePassword() {
        String print = BrowserFill.fingerprint("alice", "hunter2hunter2");
        assertFalse(print.contains("hunter2"));
        assertTrue(print.matches("[0-9a-f]{64}"));
    }

    @Test
    public void loginKeyIgnoresHostCase() {
        assertEquals(BrowserFill.loginKey("Bank.com", "alice", "pw"), BrowserFill.loginKey("bank.com", "alice", "pw"));
        assertNotEquals(BrowserFill.loginKey("bank.com", "alice", "pw"), BrowserFill.loginKey("bank.com", "alice", "pw2"));
        assertTrue(BrowserFill.loginKey(null, "alice", "pw").startsWith("|"));
    }

    @Test
    public void fillResultTreatsAnythingUnreadableAsAnError() {
        assertEquals(3, BrowserFill.fillResult("3"));
        assertEquals(1, BrowserFill.fillResult(" 1 \n"));
        assertEquals(BrowserFill.FILL_WRONG_PAGE, BrowserFill.fillResult("-2"));
        assertEquals(BrowserFill.FILL_ERROR, BrowserFill.fillResult(null));
        assertEquals(BrowserFill.FILL_ERROR, BrowserFill.fillResult("null"));
        assertEquals(BrowserFill.FILL_ERROR, BrowserFill.fillResult("\"3\""));
    }
}
