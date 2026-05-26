import os
import json
from pywebpush import webpush, WebPushException
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
VAPID_PUBLIC_KEY = os.environ["VAPID_PUBLIC_KEY"]
VAPID_PRIVATE_KEY = os.environ["VAPID_PRIVATE_KEY"]
VAPID_EMAIL = "mailto:radhikaarrora76@gmail.com"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def send_notifications():
    notifs = supabase.table("notifications").select("*").eq("sent", False).execute()
    if not notifs.data:
        print("No unsent notifications found.")
        return
    subs = supabase.table("push_subscriptions").select("*").execute()
    if not subs.data:
        print("No subscribers found.")
        return
    print(f"Sending {len(notifs.data)} notification(s) to {len(subs.data)} subscriber(s)...")
    for notif in notifs.data:
        payload = json.dumps({
            "title": notif["title"],
            "body": notif["body"],
            "icon": notif.get("thumbnail") or "/icon.png",
            "data": {"media_id": notif.get("media_id")}
        })
        success_count = 0
        fail_count = 0
        for sub in subs.data:
            subscription = sub["subscription"]
            try:
                webpush(
                    subscription_info=subscription,
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_EMAIL}
                )
                success_count += 1
            except WebPushException as e:
                print(f"Failed for sub {sub['id']}: {e}")
                if e.response and e.response.status_code in [404, 410]:
                    supabase.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
                fail_count += 1
        supabase.table("notifications").update({"sent": True}).eq("id", notif["id"]).execute()
        print(f"Notification '{notif['title']}' — sent: {success_count}, failed: {fail_count}")

if __name__ == "__main__":
    send_notifications()
