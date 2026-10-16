(function () {
  const USERS_KEY = "djsalon_users";
  const CURRENT_USER_KEY = "djsalon_current_user";
  const defaultUsers = [
    { username: "owner", password: "12345", role: "Owner", name: "Owner" },
    { username: "staff", password: "12345", role: "Staff", name: "Staff" },
    {
      username: "customer",
      password: "12345",
      role: "Guest",
      name: "Customer",
    },
  ];

  function readStoredUsers() {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const users = JSON.parse(raw);
    if (!Array.isArray(users)) {
      throw new Error("Saved salon accounts have an invalid format.");
    }
    return users;
  }

  function getUsers() {
    const users = defaultUsers.map((user) => ({ ...user }));
    readStoredUsers().forEach((savedUser) => {
      const index = users.findIndex(
        (user) =>
          user.username.toLowerCase() === savedUser.username.toLowerCase(),
      );
      if (index === -1) users.push(savedUser);
      else users[index] = savedUser;
    });
    return users;
  }

  function saveUser(user) {
    const users = readStoredUsers();
    const index = users.findIndex(
      (savedUser) =>
        savedUser.username.toLowerCase() === user.username.toLowerCase(),
    );
    if (index === -1) users.push(user);
    else users[index] = user;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setCurrentUser(user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  window.DJSALON_AUTH = {
    getUsers,
    saveUser,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
  };
})();
