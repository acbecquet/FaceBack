import SwiftUI

/// Design tokens ported verbatim from `web/src/theme.css`.
enum Theme {
    static let blue     = Color(hex: 0x1877F2)
    static let blueDark = Color(hex: 0x0B5FCE)
    static let bg       = Color(hex: 0xF0F2F5)
    static let card     = Color(hex: 0xFFFFFF)
    static let text     = Color(hex: 0x14171A)
    static let muted    = Color(hex: 0x65676B)
    static let line     = Color(hex: 0xDCDFE4)
    static let errorRed = Color(hex: 0xC0271B)
    static let radius: CGFloat = 12
}

extension Color {
    init(hex: UInt) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
