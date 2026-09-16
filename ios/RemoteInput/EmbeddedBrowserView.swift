import SwiftUI
import WebKit

struct EmbeddedBrowserView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebView(url: model.webURL)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("网页版")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) { Button("完成") { Feedback.tap(); dismiss() } }
                }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.allowsBackForwardNavigationGestures = true
        copyCookiesAndLoad(in: view)
        return view
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    private func copyCookiesAndLoad(in webView: WKWebView) {
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        let store = webView.configuration.websiteDataStore.httpCookieStore
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { webView.load(URLRequest(url: url)) }
    }
}
