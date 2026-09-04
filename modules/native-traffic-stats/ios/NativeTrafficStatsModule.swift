import ExpoModulesCore

public class NativeTrafficStatsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeTrafficStats")

    Function("getAppTrafficBytes") { () -> [String: Int64] in
      // Note: this returns total system traffic for physical and bridge interfaces,
      // not just the current app's traffic. This is an OS limitation on iOS (sandboxed).
      var rx: Int64 = 0
      var tx: Int64 = 0

      var ifaddr: UnsafeMutablePointer<ifaddrs>?
      guard getifaddrs(&ifaddr) == 0 else {
        return ["rxBytes": -1, "txBytes": -1]
      }

      var ptr = ifaddr
      while ptr != nil {
        defer { ptr = ptr?.pointee.ifa_next }

        guard let interface = ptr?.pointee else { continue }
        let name = String(cString: interface.ifa_name)

        // Sum traffic from all active network interfaces (cellular, wifi, bridge)
        // Filter: only physical and bridge interfaces, excluding loopback (lo0) and virtual tunnels (utun*).
        guard ["en0", "en1", "pdp_ip0", "pdp_ip1", "bridge100"].contains(name) else { continue }

        if interface.ifa_addr.pointee.sa_family == UInt8(AF_LINK) {
          if let dataPtr = interface.ifa_data {
            let data = dataPtr.assumingMemoryBound(to: if_data.self)
            rx += Int64(data.pointee.ifi_ibytes)
            tx += Int64(data.pointee.ifi_obytes)
          }
        }
      }
      freeifaddrs(ifaddr)

      return ["rxBytes": rx, "txBytes": tx]
    }
  }
}
