import Foundation

/// API configuration — switchable between development and production.
enum APIConfig {
    #if DEBUG
    static let baseURL = "http://localhost:4010/api/v1"
    #else
    static let baseURL = "https://api.authbox.dev/api/v1"
    #endif

    static let timeout: TimeInterval = 30
    static let maxRetries = 3
}
