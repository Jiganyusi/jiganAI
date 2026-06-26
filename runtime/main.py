"""
Jiganyusi Runtime

Build : 008 - Alur Percakapan
Status: Development

Runtime ini menguji alur percakapan internal:

Input Mentor
-> Room
-> Memory
-> Provider
-> Otak
-> Jawaban ke Mentor

Belum terhubung ke Telegram dan belum menggunakan AI sungguhan.
"""


ROOM = {
    "nama": "Default",
    "status": "Aktif",
    "topik": "Percakapan awal Runtime",
    "tanggal": "2026-06-25",
}


MEMORY = {
    "topik": ROOM["topik"],
    "pengetahuan": "Belum ada.",
    "status": "Aktif",
    "tanggal": ROOM["tanggal"],
}


PROVIDER = {
    "nama": "Default",
    "status": "Aktif",
    "versi": "1.0",
}


BRAIN = {
    "nama": "OpenClaw",
    "status": "Aktif",
    "fungsi": "Reasoning Engine",
}


def print_banner():
    print("===================================")
    print("        Jiganyusi Runtime")
    print("===================================")
    print("Status : Running")
    print("Build  : 008 - Alur Percakapan")
    print("")

    print("Room Aktif")
    print(f"Nama    : {ROOM['nama']}")
    print(f"Status  : {ROOM['status']}")
    print(f"Topik   : {ROOM['topik']}")
    print(f"Tanggal : {ROOM['tanggal']}")
    print("")

    print("Memory")
    print(f"Topik        : {MEMORY['topik']}")
    print(f"Pengetahuan  : {MEMORY['pengetahuan']}")
    print(f"Status       : {MEMORY['status']}")
    print(f"Tanggal      : {MEMORY['tanggal']}")
    print("")

    print("Provider")
    print(f"Nama    : {PROVIDER['nama']}")
    print(f"Status  : {PROVIDER['status']}")
    print(f"Versi   : {PROVIDER['versi']}")
    print("")

    print("Otak")
    print(f"Nama    : {BRAIN['nama']}")
    print(f"Status  : {BRAIN['status']}")
    print(f"Fungsi  : {BRAIN['fungsi']}")
    print("")

    print("Jiganyusi siap menerima input.")
    print("Ketik 'exit' untuk keluar.")
    print("")


def update_memory(user_input):
    MEMORY["pengetahuan"] = f"Mentor memberi input: {user_input}"
    return MEMORY


def call_provider(user_input):
    return {
        "provider": PROVIDER["nama"],
        "input": user_input,
        "status": "diterima",
    }


def call_brain(provider_result):
    user_input = provider_result["input"]

    return {
        "brain": BRAIN["nama"],
        "answer": (
            f"Otak {BRAIN['nama']} menerima input '{user_input}' "
            "dan siap melakukan reasoning."
        ),
    }


def build_response(brain_result):
    return brain_result["answer"]


def process_input(user_input):
    update_memory(user_input)
    provider_result = call_provider(user_input)
    brain_result = call_brain(provider_result)
    response = build_response(brain_result)

    return response


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

        response = process_input(user_input)

        print("")
        print(f"Input diterima di Room: {ROOM['nama']}")
        print(user_input)
        print("")
        print("Memory diperbarui:")
        print(MEMORY["pengetahuan"])
        print("")
        print(f"Provider {PROVIDER['nama']} menerima input.")
        print(f"Otak {BRAIN['nama']} memproses input.")
        print("")
        print("Jawaban:")
        print(response)
        print("")


if __name__ == "__main__":
    main()
