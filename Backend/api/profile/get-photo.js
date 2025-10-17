import dbConnect from "@/lib/db";
import User from "@/models/User";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ message: "Method not allowed" });

  const { user_id } = req.query;
  await dbConnect();

  const user = await User.findById(user_id);
  if (!user)
    return res.status(404).json({ message: "User not found" });

  res.status(200).json({
    photoUrl: user.profile_picture_url || "/images/default-avatar.png",
  });
}
