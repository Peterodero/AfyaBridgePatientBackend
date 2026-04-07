const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  
  if (isNaN(birthDate.getTime())) return null;
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

const getAgeGroup = (age) => {
  if (age === null) return 'unknown';
  if (age < 13) return 'child';
  if (age < 20) return 'teenager';
  if (age < 36) return 'young_adult';
  if (age < 51) return 'adult';
  if (age < 65) return 'middle_age';
  return 'senior';
};

module.exports = {
  calculateAge,
  getAgeGroup,
};