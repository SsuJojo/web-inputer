import SwiftUI
import WebKit

struct WebPageView: View {
    let url: URL

    var body: some View {
        WebPageRepresentable(url: url)
            .navigationTitle("网页版")
            .navigationBarTitleDisplayMode(.inline)
            .ignoresSafeArea(edges: .bottom)
    }
}

private struct WebPageRepresentable: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.allowsBackForwardNavigationGestures = true
        let request = URLRequest(url: url)
        Task { @MainActor in
            let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            for cookie in cookies {
                await webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
            }
            webView.load(request)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
