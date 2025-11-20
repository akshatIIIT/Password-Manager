## readme file
We developed a Chrome Extension–based Password Manager as our USS project.
We chose Google Chrome because it is one of the most widely used browsers globally, making our solution accessible to a large number of users.
Key Features of Our Password Manager
1. Folder-Based Password Organization
To help users manage their credentials efficiently, our extension allows them to create folders and categorize passwords inside them.
This improves structure, makes navigation easier, and helps users keep personal, work, and other passwords neatly separated.

2. Secure One-Time Password Sharing
In situations where a user wants to share a password with a trusted person—such as a family member or friend in an emergency—the extension provides a secure one-time sharing option.
The password manager generates a unique link, which the user can share. When opened in the recipient’s browser, the link allows temporary access to the password.
Note: The recipient must also be using our Chrome extension for this feature to work.

3. Password Strength Indicator
While creating or updating a password, the extension displays a real-time password strength indicator below the input field.
This helps users quickly understand whether the password they are typing is strong, moderate, or weak, and encourages better security practices.

4. Auto-Fill Functionality
The extension can automatically fill saved login credentials on websites.
When the user visits a website for which a password is stored, the extension can detect it and auto-fill the username and password, making the login process faster and more convenient.

Security Features
1. Local Encrypted Storage: All passwords are stored locally on the user’s device, not on any external or cloud server.
This reduces exposure to online attacks. Additionally, every password is stored in strongly encrypted form, ensuring that even if someone gains access to the local storage, they cannot read the actual passwords without the decryption key.
2. Secure Vault with Master Password and 2FA: The password manager includes a dedicated vault, protected by a master password.
Users must enter this master password to access their stored credentials.For enhanced protection, we have also implemented Two-Factor Authentication (2FA), adding an extra layer of security before the vault can be unlocked
3. One-Time Password Sharing: During user requirement analysis, one major concern was the security of password-sharing links.
To address this, we implemented one-time, auto-expiring password sharing:
The extension generates a unique, encrypted link.
The link can be used only once.
It automatically expires after 5 minutes, ensuring passwords are not left exposed for long periods.
This design balances convenience with strong security.
4. Auto-Logout on Inactivity: To prevent unauthorized access during moments of physical absence—such as stepping away from the laptop—the extension includes an auto-logout mechanism.If the user is inactive for five minutes, the vault automatically locks itself, requiring re-authentication through the master password (and 2FA if enabled).
