// Draws the DMG window background: light, so Finder's black icon labels stay
// readable, with an arrow in the Prism's gradient from the app to the
// Applications folder and a one-line hint in Voltline's UI typeface (Rajdhani).
//
//   swift scripts/dmg-background.swift <output.png> <scale>
//
// scripts/make-macos-app.sh renders it at 1x and 2x and combines them into a
// HiDPI TIFF. Icon positions must match the create-dmg call in that script.
import AppKit
import CoreText

let args = CommandLine.arguments
let output = args.count > 1 ? args[1] : "dmg-background.png"
let scale = args.count > 2 ? CGFloat(Double(args[2]) ?? 1) : 1

// Window content size and icon centers, in points (Finder coordinates: origin top-left)
let width: CGFloat = 640, height: CGFloat = 400
let appX: CGFloat = 170, appsX: CGFloat = 470, iconY: CGFloat = 185

// Rajdhani from the npm package the web build already self-hosts, if installed
let fontFile = URL(fileURLWithPath: args[0]).deletingLastPathComponent()
    .appendingPathComponent("../node_modules/@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2")
CTFontManagerRegisterFontsForURL(fontFile as CFURL, .process, nil)
func font(_ name: String, _ size: CGFloat) -> NSFont {
    NSFont(name: name, size: size * scale) ?? NSFont.systemFont(ofSize: size * scale, weight: .medium)
}
func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}

let pixelsWide = Int(width * scale), pixelsHigh = Int(height * scale)
guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixelsWide, pixelsHigh: pixelsHigh,
                                 bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// AppKit's origin is bottom-left; convert from Finder's top-left coordinates
func y(_ finderY: CGFloat) -> CGFloat { (height - finderY) * scale }
func x(_ v: CGFloat) -> CGFloat { v * scale }

// Background: a subtle vertical gradient
NSGradient(starting: color(0xf5f6fc), ending: color(0xe3e6f3))!.draw(in: NSRect(x: 0, y: 0, width: x(width), height: y(0)), angle: -90)

// Arrow between the two icons, stroked in the Prism gradient (red, yellow, green, blue), with a soft halo
let arrowStart = appX + 70, arrowEnd = appsX - 70
let prism = NSGradient(colors: [color(0xff3b5c), color(0xf0c419), color(0x1fd99a), color(0x4d7bff)])!
for (lineWidth, alpha) in [(CGFloat(9), CGFloat(0.16)), (3.5, 1.0)] {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: x(arrowStart), y: y(iconY)))
    path.line(to: NSPoint(x: x(arrowEnd), y: y(iconY)))
    path.move(to: NSPoint(x: x(arrowEnd - 14), y: y(iconY - 12)))
    path.line(to: NSPoint(x: x(arrowEnd), y: y(iconY)))
    path.line(to: NSPoint(x: x(arrowEnd - 14), y: y(iconY + 12)))
    // Fill the outline of the stroke with the gradient
    guard let ctx = NSGraphicsContext.current?.cgContext else { exit(1) }
    ctx.saveGState()
    ctx.setLineWidth(lineWidth * scale)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.addPath(path.cgPath)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    ctx.setAlpha(alpha)
    prism.draw(in: NSRect(x: x(arrowStart - 8), y: y(iconY + 20), width: x(arrowEnd - arrowStart + 16), height: x(40)), angle: 0)
    ctx.restoreGState()
}

// Hint text, centered near the bottom
func drawCentered(_ text: String, _ f: NSFont, _ c: NSColor, finderY: CGFloat, tracking: CGFloat = 0) {
    let attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: c, .kern: tracking * scale]
    let s = NSAttributedString(string: text, attributes: attrs)
    let size = s.size()
    s.draw(at: NSPoint(x: (x(width) - size.width) / 2, y: y(finderY) - size.height / 2))
}
drawCentered("Drag Voltline into Applications to install it", font("Rajdhani-SemiBold", 17), color(0x1a1a2e), finderY: 318, tracking: 0.3)

NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: output))
