"""
Jiganyusi Runtime

Build : 003 - Core Runtime
Status: Development

Entry point pertama Jiganyusi.

Runtime ini belum terhubung ke AI, Telegram, Ingatan, maupun Ruangan.
Tujuannya hanya memastikan Runtime dapat hidup, menunggu input Mentor,
menerima input, lalu kembali menunggu input berikutnya.
"""


ROOM = {
    "nama": "Default",
    "status": "Aktif",
    "topik": "Percakapan awal Runtime",
    "tanggal": "2026-06-25",
}


def print_banner():
    print("===================================")
    print("        Jiganyusi Runtime")
    print("===================================")
    print("Status : Running")
    print("Build  : 004 - Room System")
    print("")
    print("Room Aktif")
    print(f"Nama    : {ROOM['nama']}")
    print(f"Status  : {ROOM['status']}")
    print(f"Topik   : {ROOM['topik']}")
    print(f"Tanggal : {ROOM['tanggal']}")
    print("")
    print("Jiganyusi siap menerima input.")
    print("Ketik 'exit' untuk keluar.")
    print("")


def main():
    print_banner()

    while True:
        user_input = input("> ").strip()

        if user_input.lower() in ["exit", "quit", "keluar"]:
            print("")
            print("Runtime dihentikan.")
            break

        if not user_input:
            print("Input kosong. Silakan ketik sesuatu.")
            continue

        print("")
        print(f"Input diterima di Room: {ROOM['nama']}")
        print(user_input)
        print("")
        print("Catatan: Runtime belum terhubung ke Otak.")
        print("")


if __name__ == "__main__":
    main()
