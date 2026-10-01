import os

file_path = "src/pages/HomePage.tsx"
if not os.path.exists(file_path):
    print("File not found!")
    exit(1)

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

if "shortVideos" in content:
    print("Shorts shelf code is already present!")
else:
    target = "const visiblePosts ="
    if target in content:
        replacement = "const shortVideos = visiblePosts.filter(post => post.isShort || (!post.isLongVideo && post.videoSource));\nconst longVideos = visiblePosts.filter(post => !post.isShort && post.isLongVideo);\n\nconst visiblePosts ="
        content = content.replace(target, replacement, 1)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Successfully patched HomePage.tsx!")
    else:
        print("Could not find insertion target in HomePage.tsx")
