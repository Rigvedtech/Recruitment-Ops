from app import create_app
import os
app = create_app()

# Print out registered routes for debugging
print("\nRegistered Routes:")
for rule in app.url_map.iter_rules():
    print(f"{rule.endpoint}: {rule.rule}")
print("\n")

if __name__ == '__main__':
    port = int(os.getenv('BACKEND_PORT'))
    app.run(port = port,host = '0.0.0.0',debug=True) 